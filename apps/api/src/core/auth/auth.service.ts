import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Raw, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'crypto';
import { UserEntity, TenantEntity, TenantMembershipEntity, RefreshSessionEntity } from '@weaver/db';
import type { AuthProvider, AuthResponse, CreateOAuthOrganizationDto, LoginDto, RegisterDto } from '@weaver/shared';
import { TenantService, TenantProvisioningService } from '../tenant';

export interface JwtPayload {
  sub: string;
  email: string;
  tenantId: string;
  role: string;
  tokenType: 'access' | 'refresh';
  jti?: string;
}

export type ExternalAuthProvider = Exclude<AuthProvider, 'local'>;

export interface OAuthIdentity {
  provider: ExternalAuthProvider;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  tenantSlug?: string;
}

export interface OAuthContextPayload {
  sub: string;
  provider: ExternalAuthProvider;
  purpose: 'oauth-context';
}

export interface OrganizationChoice {
  id: string;
  name: string;
  slug: string;
  role: string;
}

const BCRYPT_ROUNDS = 10;
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';
const REFRESH_TOKEN_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

type SanitizedUser = Omit<UserEntity, 'passwordHash'>;

@Injectable()
export class AuthService {
  private readonly dummyPasswordHash = bcrypt.hash('invalid-login-placeholder', BCRYPT_ROUNDS);
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(TenantMembershipEntity)
    private readonly membershipRepo: Repository<TenantMembershipEntity>,
    @InjectRepository(RefreshSessionEntity)
    private readonly refreshSessionRepo: Repository<RefreshSessionEntity>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly tenantService: TenantService,
    private readonly tenantProvisioningService: TenantProvisioningService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse<SanitizedUser>> {
    const email = this.normalizeEmail(dto.email);
    const existing = await this.findUserByEmail(email);
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const schemaName = `tenant_${dto.orgSlug.replace(/-/g, '_')}`;
    let provisioningAttempted = false;

    try {
      return await this.userRepo.manager.transaction(async (manager) => {
        // Keep concurrent attempts for either identifier in one transaction.
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtext($1)), pg_advisory_xact_lock(hashtext($2))',
          [`registration-email:${email}`, `registration-slug:${dto.orgSlug}`],
        );

        if (await manager.getRepository(UserEntity).findOneBy({
          email: Raw((column) => `LOWER(${column}) = :email`, { email }),
        })) {
          throw new ConflictException('A user with this email already exists');
        }
        if (await manager.getRepository(TenantEntity).findOneBy({ slug: dto.orgSlug })) {
          throw new ConflictException('An organization with this slug already exists');
        }

        const userRepo = manager.getRepository(UserEntity);
        const user = await userRepo.save(userRepo.create({
          email,
          displayName: dto.displayName,
          passwordHash,
          authProvider: 'local',
          authProviders: ['local'],
        }));

        const tenant = await this.tenantService.create({
          name: dto.orgName,
          slug: dto.orgSlug,
        }, manager);

        provisioningAttempted = true;
        await this.tenantProvisioningService.provisionSchema(tenant.schemaName);

        const membershipRepo = manager.getRepository(TenantMembershipEntity);
        await membershipRepo.save(membershipRepo.create({
          tenantId: tenant.id,
          userId: user.id,
          role: 'owner',
        }));

        const payload = {
          sub: user.id,
          email: user.email,
          tenantId: tenant.id,
          role: 'owner',
        };
        const { accessToken, refreshToken } = await this.issueTokenPair(payload, manager);

        return {
          accessToken,
          refreshToken,
          user: this.sanitizeUser(user),
          tenantId: tenant.id,
        };
      });
    } catch (error) {
      if (provisioningAttempted) {
        await this.tenantProvisioningService.dropSchema(schemaName);
      }
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<AuthResponse<SanitizedUser>> {
    const user = await this.validateUser(dto.email, dto.password);

    const membership = dto.tenantId
      ? await this.membershipRepo.findOneBy({
          userId: user.id,
          tenantId: dto.tenantId,
        })
      : await this.membershipRepo.findOne({
          where: { userId: user.id },
          order: { createdAt: 'ASC' },
        });

    if (!membership) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      tenantId: membership.tenantId,
      role: membership.role,
    };

    const { accessToken, refreshToken } = await this.issueTokenPair(payload);

    return {
      accessToken,
      refreshToken,
      user: this.sanitizeUser(user),
      tenantId: membership.tenantId,
    };
  }

  async rotateRefreshToken(refreshToken: string) {
    const payload = await this.verifyRefreshToken(refreshToken);
    const tokenHash = this.hashToken(refreshToken);

    return this.refreshSessionRepo.manager.transaction(async (manager) => {
      const sessionRepo = manager.getRepository(RefreshSessionEntity);
      const session = await sessionRepo.findOne({
        where: { tokenHash },
        lock: { mode: 'pessimistic_write' },
      });

      if (
        !session ||
        session.userId !== payload.sub ||
        session.tenantId !== payload.tenantId ||
        session.expiresAt.getTime() <= Date.now()
      ) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const user = await manager.getRepository(UserEntity).findOneBy({ id: payload.sub });
      const membership = await manager.getRepository(TenantMembershipEntity).findOneBy({
        userId: payload.sub,
        tenantId: payload.tenantId,
      });
      if (!user || !membership) {
        throw new UnauthorizedException('Refresh session is no longer valid');
      }

      await sessionRepo.delete({ id: session.id });

      return this.issueTokenPair(
        {
          sub: user.id,
          email: user.email,
          tenantId: membership.tenantId,
          role: membership.role,
        },
        manager,
      );
    });
  }

  async revokeRefreshToken(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) {
      return;
    }

    await this.refreshSessionRepo.delete({ tokenHash: this.hashToken(refreshToken) });
  }

  async completeOAuth(identity: OAuthIdentity) {
    const email = identity.email.trim().toLowerCase();
    if (!email) {
      throw new UnauthorizedException('The identity provider did not return an email address');
    }

    let user = await this.findUserByEmail(email);
    if (!user) {
      user = this.userRepo.create({
        email,
        displayName: identity.displayName || email,
        passwordHash: null,
        authProvider: identity.provider,
        authProviders: [identity.provider],
        avatarUrl: identity.avatarUrl,
      });
    } else {
      const linkedProviders = user.authProviders?.length ? user.authProviders : [user.authProvider];
      user.authProviders = Array.from(new Set([...linkedProviders, identity.provider]));
      if (!user.avatarUrl && identity.avatarUrl) {
        user.avatarUrl = identity.avatarUrl;
      }
    }
    user = await this.userRepo.save(user);

    if (identity.tenantSlug) {
      const tenant = await this.tenantService.findBySlug(identity.tenantSlug);
      if (!tenant || !(await this.isProviderEnabled(tenant.id, identity.provider))) {
        throw new ForbiddenException('SSO is not enabled for this organization');
      }

      let membership = await this.membershipRepo.findOneBy({
        userId: user.id,
        tenantId: tenant.id,
      });
      if (!membership) {
        membership = this.membershipRepo.create({
          userId: user.id,
          tenantId: tenant.id,
          role: 'member',
        });
        await this.membershipRepo.save(membership);
      }

      return {
        status: 'ready' as const,
        user: this.sanitizeUser(user),
        session: await this.issueSession(user, membership),
      };
    }

    const memberships = await this.getEnabledMemberships(user.id, identity.provider);
    if (memberships.length === 0) {
      return {
        status: 'needsOrganization' as const,
        user: this.sanitizeUser(user),
        organizations: [] as OrganizationChoice[],
      };
    }

    if (memberships.length === 1) {
      return {
        status: 'ready' as const,
        user: this.sanitizeUser(user),
        session: await this.issueSession(user, memberships[0]),
      };
    }

    return {
      status: 'chooseOrganization' as const,
      user: this.sanitizeUser(user),
      organizations: memberships.map((membership) => ({
        id: membership.tenant.id,
        name: membership.tenant.name,
        slug: membership.tenant.slug,
        role: membership.role,
      })),
    };
  }

  createOAuthContextToken(userId: string, provider: ExternalAuthProvider) {
    const payload: OAuthContextPayload = {
      sub: userId,
      provider,
      purpose: 'oauth-context',
    };
    return this.jwtService.sign(payload, { expiresIn: '10m' });
  }

  verifyOAuthContextToken(token: string): OAuthContextPayload {
    try {
      const payload = this.jwtService.verify<OAuthContextPayload>(token);
      if (payload.purpose !== 'oauth-context') {
        throw new Error('Unexpected token purpose');
      }
      return payload;
    } catch {
      throw new UnauthorizedException('OAuth session has expired');
    }
  }

  async getOAuthContext(userId: string, provider: ExternalAuthProvider) {
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    const memberships = await this.getEnabledMemberships(user.id, provider);
    return {
      user: this.sanitizeUser(user),
      organizations: memberships.map((membership) => ({
        id: membership.tenant.id,
        name: membership.tenant.name,
        slug: membership.tenant.slug,
        role: membership.role,
      })),
    };
  }

  async selectOrganization(userId: string, provider: ExternalAuthProvider, tenantId: string) {
    const user = await this.userRepo.findOneBy({ id: userId });
    const membership = await this.membershipRepo.findOneBy({ userId, tenantId });
    if (!user || !membership) {
      throw new ForbiddenException('You are not a member of this organization');
    }
    if (!(await this.isProviderEnabled(tenantId, provider))) {
      throw new ForbiddenException('This sign-in provider is disabled for the organization');
    }
    return this.issueSession(user, membership);
  }

  async createOAuthOrganization(userId: string, dto: CreateOAuthOrganizationDto) {
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    if (await this.tenantService.findBySlug(dto.orgSlug)) {
      throw new ConflictException('An organization with this slug already exists');
    }

    const tenant = await this.tenantService.create({
      name: dto.orgName,
      slug: dto.orgSlug,
    });
    await this.tenantProvisioningService.provisionSchema(tenant.schemaName);

    const membership = this.membershipRepo.create({
      tenantId: tenant.id,
      userId: user.id,
      role: 'owner',
    });
    await this.membershipRepo.save(membership);
    return this.issueSession(user, membership);
  }

  async createSessionForUser(userId: string, tenantId: string) {
    const user = await this.userRepo.findOneBy({ id: userId });
    const membership = await this.membershipRepo.findOneBy({ userId, tenantId });
    if (!user || !membership) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.issueSession(user, membership);
  }

  async validateUser(email: string, password: string): Promise<UserEntity> {
    const user = await this.findUserByEmail(email);
    // Use the same work factor for nonexistent and passwordless accounts.
    const hash = user?.passwordHash || await this.dummyPasswordHash;
    const isMatch = await bcrypt.compare(password, hash);
    if (!user?.passwordHash || !isMatch) throw new UnauthorizedException('Invalid credentials');

    return user;
  }

  async getProfile(userId: string, tenantId: string) {
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    const membership = await this.membershipRepo.findOneBy({ userId, tenantId });
    if (!membership) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return { ...this.sanitizeUser(user), role: membership.role };
  }

  private sanitizeUser(user: UserEntity): SanitizedUser {
    const { passwordHash, ...rest } = user;
    return rest;
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private findUserByEmail(email: string) {
    const normalizedEmail = this.normalizeEmail(email);
    return this.userRepo.findOneBy({
      email: Raw((column) => `LOWER(${column}) = :normalizedEmail`, { normalizedEmail }),
    });
  }

  private async issueSession(user: UserEntity, membership: TenantMembershipEntity) {
    const payload = {
      sub: user.id,
      email: user.email,
      tenantId: membership.tenantId,
      role: membership.role,
    };
    return {
      ...await this.issueTokenPair(payload),
      user: this.sanitizeUser(user),
      tenantId: membership.tenantId,
    };
  }

  private async getEnabledMemberships(userId: string, provider: ExternalAuthProvider) {
    const memberships = await this.membershipRepo.find({
      where: { userId },
      relations: { tenant: true },
      order: { createdAt: 'ASC' },
    });
    const enabled = await Promise.all(
      memberships.map(async (membership) => ({
        membership,
        enabled: await this.isProviderEnabled(membership.tenantId, provider),
      })),
    );
    return enabled.filter((item) => item.enabled).map((item) => item.membership);
  }

  private async isProviderEnabled(
    tenantId: string,
    provider: ExternalAuthProvider,
  ): Promise<boolean> {
    const settings = await this.tenantService.getSettings(tenantId);
    return settings.sso[provider].enabled;
  }

  private async issueTokenPair(
    payload: Omit<JwtPayload, 'tokenType' | 'jti'>,
    manager?: EntityManager,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = this.jwtService.sign(
      { ...payload, tokenType: 'access' } satisfies JwtPayload,
      { expiresIn: ACCESS_TOKEN_EXPIRY },
    );
    const jti = randomUUID();
    const refreshToken = this.jwtService.sign(
      { ...payload, tokenType: 'refresh', jti } satisfies JwtPayload,
      {
        expiresIn: REFRESH_TOKEN_EXPIRY,
        secret: this.refreshTokenSecret(),
      },
    );
    const repo = manager
      ? manager.getRepository(RefreshSessionEntity)
      : this.refreshSessionRepo;
    await repo.save(
      repo.create({
        userId: payload.sub,
        tenantId: payload.tenantId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_LIFETIME_MS),
      }),
    );

    return { accessToken, refreshToken };
  }

  private async verifyRefreshToken(token: string): Promise<JwtPayload> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.refreshTokenSecret(),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (payload.tokenType !== 'refresh' || !payload.jti) {
      throw new UnauthorizedException('Refresh token required');
    }

    return payload;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private refreshTokenSecret(): string {
    return this.config.get<string>('JWT_REFRESH_SECRET')
      ?? this.config.getOrThrow<string>('JWT_SECRET');
  }
}
