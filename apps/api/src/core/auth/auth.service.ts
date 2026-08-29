import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UserEntity, TenantMembershipEntity } from '@weaver/db';
import type { AuthResponse, RegisterDto, LoginDto } from '@weaver/shared';
import { TenantService, TenantProvisioningService } from '../tenant';

export interface JwtPayload {
  sub: string;
  email: string;
  tenantId: string;
  role: string;
}

const BCRYPT_ROUNDS = 10;
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

type SanitizedUser = Omit<UserEntity, 'passwordHash'>;

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

  async register(dto: RegisterDto): Promise<AuthResponse<SanitizedUser>> {
    const existing = await this.userRepo.findOneBy({ email: dto.email });
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = this.userRepo.create({
      email: dto.email,
      displayName: dto.displayName,
      passwordHash,
      authProvider: 'local',
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
      tenantId: tenant.id,
    };
  }

  async login(dto: LoginDto): Promise<AuthResponse<SanitizedUser>> {
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

  async getProfile(userId: string) {
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.sanitizeUser(user);
  }

  private sanitizeUser(user: UserEntity): SanitizedUser {
    const { passwordHash, ...rest } = user;
    return rest;
  }
}
