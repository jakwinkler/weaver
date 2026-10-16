import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Raw, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, randomUUID } from 'crypto';
import {
  UserEntity,
  TenantEntity,
  TenantMembershipEntity,
  RefreshSessionEntity,
  OrganizationInvitationEntity,
} from '@weaver/db';
import type { AuthProvider, AuthResponse, CreateOAuthOrganizationDto, LoginDto, RegisterDto, CreateInvitationDto, AcceptInvitationDto } from '@weaver/shared';
import { TenantService, TenantProvisioningService } from '../tenant';
import { tokenSessionVersion } from './session-version';

export interface JwtPayload {
  sub: string;
  email: string;
  tenantId: string;
  role: string;
  tokenType: 'access' | 'refresh';
  jti?: string;
  /** The account's session version at issue time; absent on tokens issued before it existed. */
  sessionVersion?: number;
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

export const BCRYPT_ROUNDS = 10;
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';
const REFRESH_TOKEN_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

type SanitizedUser = Omit<UserEntity, 'passwordHash' | 'sessionVersion'>;

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
    @InjectRepository(OrganizationInvitationEntity)
    private readonly invitationRepo: Repository<OrganizationInvitationEntity>,
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

        if (await this.findUserByEmail(dto.email, manager)) {
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
          sessionVersion: user.sessionVersion,
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
      sessionVersion: user.sessionVersion,
    };

    const { accessToken, refreshToken } = await this.issueTokenPair(payload);

    return {
      accessToken,
      refreshToken,
      user: this.sanitizeUser(user),
      tenantId: membership.tenantId,
    };
  }

  async listOrganizations(userId: string) {
    const memberships = await this.membershipRepo.find({
      where: { userId },
      relations: { tenant: true },
      order: { createdAt: 'ASC' },
    });
    return memberships.map((membership) => ({
      tenantId: membership.tenantId,
      name: membership.tenant.name,
      slug: membership.tenant.slug,
      role: membership.role,
    }));
  }

  async switchOrganization(userId: string, tenantId: string): Promise<AuthResponse<SanitizedUser>> {
    const membership = await this.membershipRepo.findOneBy({ userId, tenantId });
    if (!membership) {
      throw new UnauthorizedException('User has no tenant membership');
    }
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    const { accessToken, refreshToken } = await this.issueTokenPair({
      sub: user.id,
      email: user.email,
      tenantId: membership.tenantId,
      role: membership.role,
      sessionVersion: user.sessionVersion,
    });
    return { accessToken, refreshToken, user: this.sanitizeUser(user), tenantId: membership.tenantId };
  }

  async createInvitation(tenantId: string, dto: CreateInvitationDto) {
    const existing = await this.findUserByEmail(dto.email);
    if (existing && await this.membershipRepo.findOneBy({ tenantId, userId: existing.id })) {
      throw new ConflictException('User is already a member of this organization');
    }
    const token = randomBytes(32).toString('hex');
    const invitation = await this.invitationRepo.save(this.invitationRepo.create({
      tenantId,
      email: dto.email,
      role: dto.role,
      tokenHash: this.hashToken(token),
      expiresAt: new Date(Date.now() + INVITATION_LIFETIME_MS),
    }));
    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      token,
    };
  }

  async getInvitation(token: string) {
    const invitation = await this.findActiveInvitation(token);
    return {
      email: invitation.email,
      role: invitation.role,
      organizationName: invitation.tenant.name,
      expiresAt: invitation.expiresAt,
    };
  }

  async acceptInvitation(token: string, dto: AcceptInvitationDto): Promise<AuthResponse<SanitizedUser>> {
    if (!/^[a-f0-9]{64}$/.test(token)) {
      throw new UnauthorizedException('Invalid invitation');
    }
    return this.invitationRepo.manager.transaction(async (manager) => {
      const invitation = await manager.getRepository(OrganizationInvitationEntity).findOne({
        where: { tokenHash: this.hashToken(token) },
        lock: { mode: 'pessimistic_write' },
      });
      if (!invitation || invitation.acceptedAt || invitation.expiresAt.getTime() <= Date.now()) {
        throw new UnauthorizedException('Invalid or expired invitation');
      }
      if (dto.email !== invitation.email) {
        throw new BadRequestException('Email does not match invitation');
      }

      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`registration-email:${dto.email}`]);
      const userRepo = manager.getRepository(UserEntity);
      let user = await this.findUserByEmail(dto.email, manager);
      if (user) {
        if (!user.passwordHash || !(await bcrypt.compare(dto.password, user.passwordHash))) {
          throw new UnauthorizedException('Invalid credentials');
        }
      } else {
        user = await userRepo.save(userRepo.create({
          email: dto.email,
          displayName: dto.displayName,
          passwordHash: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
          authProvider: 'local',
          authProviders: ['local'],
        }));
      }

      const membershipRepo = manager.getRepository(TenantMembershipEntity);
      if (await membershipRepo.findOneBy({ tenantId: invitation.tenantId, userId: user.id })) {
        throw new ConflictException('User is already a member of this organization');
      }
      await membershipRepo.save(membershipRepo.create({
        tenantId: invitation.tenantId,
        userId: user.id,
        role: invitation.role,
      }));
      invitation.acceptedAt = new Date();
      await manager.getRepository(OrganizationInvitationEntity).save(invitation);
      const { accessToken, refreshToken } = await this.issueTokenPair({
        sub: user.id,
        email: user.email,
        tenantId: invitation.tenantId,
        role: invitation.role,
        sessionVersion: user.sessionVersion,
      }, manager);
      return { accessToken, refreshToken, user: this.sanitizeUser(user), tenantId: invitation.tenantId };
    });
  }

  private async findActiveInvitation(token: string): Promise<OrganizationInvitationEntity> {
    if (!/^[a-f0-9]{64}$/.test(token)) {
      throw new UnauthorizedException('Invalid invitation');
    }
    const invitation = await this.invitationRepo.findOne({
      where: { tokenHash: this.hashToken(token) },
      relations: ['tenant'],
    });
    if (!invitation || invitation.acceptedAt || invitation.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Invalid or expired invitation');
    }
    return invitation;
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
      // A sign-in that raced a password reset can leave a session row behind the reset's
      // cleanup; its token still carries the old version.
      if (!user || !membership || tokenSessionVersion(payload) !== user.sessionVersion) {
        throw new UnauthorizedException('Refresh session is no longer valid');
      }

      await sessionRepo.delete({ id: session.id });

      return this.issueTokenPair(
        {
          sub: user.id,
          email: user.email,
          tenantId: membership.tenantId,
          role: membership.role,
          sessionVersion: user.sessionVersion,
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
      user = await this.userRepo.save(this.userRepo.create({
        email,
        displayName: identity.displayName || email,
        passwordHash: null,
        authProvider: identity.provider,
        authProviders: [identity.provider],
        avatarUrl: identity.avatarUrl,
      }));
    } else {
      user = await this.linkOAuthIdentity(user.id, identity);
    }

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

  /**
   * Adds the provider, and the avatar if the account has none, to an existing account. The row
   * lock makes concurrent sign-ins read each other's provider before adding their own, and
   * update() writes only these columns, so a concurrent profile change is kept.
   */
  private linkOAuthIdentity(userId: string, identity: OAuthIdentity): Promise<UserEntity> {
    return this.userRepo.manager.transaction(async (manager) => {
      const userRepo = manager.getRepository(UserEntity);
      const user = await userRepo.findOne({
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) {
        throw new UnauthorizedException('Account not found');
      }

      const linkedProviders = user.authProviders?.length ? user.authProviders : [user.authProvider];
      const authProviders = Array.from(new Set([...linkedProviders, identity.provider]));
      const changes: Partial<Pick<UserEntity, 'authProviders' | 'avatarUrl'>> = {};
      if (authProviders.join(',') !== (user.authProviders ?? []).join(',')) {
        changes.authProviders = authProviders;
      }
      if (!user.avatarUrl && identity.avatarUrl) {
        changes.avatarUrl = identity.avatarUrl;
      }
      if (Object.keys(changes).length === 0) {
        return user;
      }

      await userRepo.update({ id: userId }, changes);
      return userRepo.findOneByOrFail({ id: userId });
    });
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

  /** Which instance-wide social sign-in buttons can work. Organizations may still turn them off. */
  getSignInProviders(): { google: boolean; github: boolean } {
    const configured = (key: 'GOOGLE' | 'GITHUB') =>
      !!this.config.get<string>(`${key}_CLIENT_ID`) && !!this.config.get<string>(`${key}_CLIENT_SECRET`);
    return { google: configured('GOOGLE'), github: configured('GITHUB') };
  }

  async getOAuthContext(userId: string, provider: ExternalAuthProvider) {
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    const memberships = await this.getEnabledMemberships(user.id, provider);
    const allMemberships = await this.membershipRepo.countBy({ userId: user.id });
    return {
      user: this.sanitizeUser(user),
      provider,
      // Organizations the account belongs to that turned this provider off. The sign-up
      // screen uses it to steer existing members back to sign-in, not into a new organization.
      blockedOrganizationCount: allMemberships - memberships.length,
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
    const { passwordHash, sessionVersion, ...rest } = user;
    return rest;
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private findUserByEmail(email: string, manager?: EntityManager) {
    const normalizedEmail = this.normalizeEmail(email);
    const repo = manager?.getRepository(UserEntity) ?? this.userRepo;
    return repo.findOneBy({
      email: Raw((column) => `LOWER(${column}) = :normalizedEmail`, { normalizedEmail }),
    });
  }

  private async issueSession(user: UserEntity, membership: TenantMembershipEntity) {
    const payload = {
      sub: user.id,
      email: user.email,
      tenantId: membership.tenantId,
      role: membership.role,
      sessionVersion: user.sessionVersion,
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
    payload: Omit<JwtPayload, 'tokenType' | 'jti' | 'sessionVersion'> & { sessionVersion: number },
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
