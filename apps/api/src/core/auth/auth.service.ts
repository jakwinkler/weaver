import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'crypto';
import {
  UserEntity,
  TenantEntity,
  TenantMembershipEntity,
  RefreshSessionEntity,
} from '@weaver/db';
import type { AuthResponse, RegisterDto, LoginDto } from '@weaver/shared';
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

        if (await manager.getRepository(UserEntity).findOneBy({ email: dto.email })) {
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
    const user = await this.userRepo.findOneBy({ email });
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
