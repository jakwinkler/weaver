import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, randomUUID } from 'crypto';
import {
  UserEntity,
  TenantEntity,
  TenantMembershipEntity,
  RefreshSessionEntity,
  OrganizationInvitationEntity,
} from '@weaver/db';
import type { AuthResponse, RegisterDto, LoginDto, CreateInvitationDto, AcceptInvitationDto } from '@weaver/shared';
import { TenantService, TenantProvisioningService } from '../tenant';

export interface JwtPayload {
  sub: string;
  email: string;
  tenantId: string;
  role: string;
  tokenType: 'access' | 'refresh';
  jti?: string;
}

const BCRYPT_ROUNDS = 10;
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';
const REFRESH_TOKEN_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

type SanitizedUser = Omit<UserEntity, 'passwordHash'>;

@Injectable()
export class AuthService {
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
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const schemaName = `tenant_${dto.orgSlug.replace(/-/g, '_')}`;
    let provisioningAttempted = false;

    try {
      return await this.userRepo.manager.transaction(async (manager) => {
        // Keep concurrent attempts for either identifier in one transaction.
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtext($1)), pg_advisory_xact_lock(hashtext($2))',
          [`registration-email:${dto.email}`, `registration-slug:${dto.orgSlug}`],
        );

        if (await this.findUserByEmail(dto.email, manager)) {
          throw new ConflictException('A user with this email already exists');
        }
        if (await manager.getRepository(TenantEntity).findOneBy({ slug: dto.orgSlug })) {
          throw new ConflictException('An organization with this slug already exists');
        }

        const userRepo = manager.getRepository(UserEntity);
        const user = await userRepo.save(userRepo.create({
          email: dto.email,
          displayName: dto.displayName,
          passwordHash,
          authProvider: 'local',
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
      throw new UnauthorizedException('User has no tenant membership');
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

  async getProfile(userId: string, tenantId: string) {
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    const membership = await this.membershipRepo.findOneBy({ userId, tenantId });
    if (!membership) {
      throw new UnauthorizedException('User has no tenant membership');
    }

    return { ...this.sanitizeUser(user), role: membership.role };
  }

  private sanitizeUser(user: UserEntity): SanitizedUser {
    const { passwordHash, ...rest } = user;
    return rest;
  }

  private findUserByEmail(email: string, manager?: EntityManager): Promise<UserEntity | null> {
    const repo = manager?.getRepository(UserEntity) ?? this.userRepo;
    return repo.createQueryBuilder('user')
      .where('LOWER(user.email) = :email', { email: email.trim().toLowerCase() })
      .getOne();
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
