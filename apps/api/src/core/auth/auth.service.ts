import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Raw, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UserEntity, TenantMembershipEntity } from '@weaver/db';
import { RegisterDto, LoginDto, CreateOAuthOrganizationDto, AuthProvider } from '@weaver/shared';
import { TenantService, TenantProvisioningService } from '../tenant';

export interface JwtPayload {
  sub: string;
  email: string;
  tenantId: string;
  role: string;
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

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(TenantMembershipEntity)
    private readonly membershipRepo: Repository<TenantMembershipEntity>,
    private readonly jwtService: JwtService,
    private readonly tenantService: TenantService,
    private readonly tenantProvisioningService: TenantProvisioningService,
  ) {}

  async register(dto: RegisterDto) {
    const email = this.normalizeEmail(dto.email);
    const existing = await this.findUserByEmail(email);
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = this.userRepo.create({
      email,
      displayName: dto.displayName,
      passwordHash,
      authProvider: 'local',
      authProviders: ['local'],
    });
    await this.userRepo.save(user);

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

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      tenantId: tenant.id,
      role: 'owner',
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: ACCESS_TOKEN_EXPIRY,
    });
    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: REFRESH_TOKEN_EXPIRY,
    });

    return {
      accessToken,
      refreshToken,
      user: this.sanitizeUser(user),
      tenant,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.validateUser(dto.email, dto.password);

    const membership = await this.membershipRepo.findOneBy({
      userId: user.id,
    });

    if (!membership) {
      throw new UnauthorizedException('User has no tenant membership');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      tenantId: membership.tenantId,
      role: membership.role,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: ACCESS_TOKEN_EXPIRY,
    });
    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: REFRESH_TOKEN_EXPIRY,
    });

    return {
      accessToken,
      refreshToken,
      user: this.sanitizeUser(user),
      tenantId: membership.tenantId,
    };
  }

  async refreshToken(userId: string) {
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const membership = await this.membershipRepo.findOneBy({ userId });
    if (!membership) {
      throw new UnauthorizedException('User has no tenant membership');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      tenantId: membership.tenantId,
      role: membership.role,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: ACCESS_TOKEN_EXPIRY,
    });

    return { accessToken };
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
        session: this.issueSession(user, membership),
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
        session: this.issueSession(user, memberships[0]),
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
      throw new UnauthorizedException('User has no tenant membership');
    }
    return this.issueSession(user, membership);
  }

  async validateUser(email: string, password: string): Promise<UserEntity> {
    const user = await this.findUserByEmail(email);
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return user;
  }

  async getProfile(userId: string) {
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.sanitizeUser(user);
  }

  private sanitizeUser(user: UserEntity) {
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

  private issueSession(user: UserEntity, membership: TenantMembershipEntity) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      tenantId: membership.tenantId,
      role: membership.role,
    };
    return {
      accessToken: this.jwtService.sign(payload, {
        expiresIn: ACCESS_TOKEN_EXPIRY,
      }),
      refreshToken: this.jwtService.sign(payload, {
        expiresIn: REFRESH_TOKEN_EXPIRY,
      }),
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
}
