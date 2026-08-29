import { Global, Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiKeyEntity, UserEntity, TenantMembershipEntity } from '@weaver/db';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard, JwtOnlyAuthGuard } from './jwt-auth.guard';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeyRateLimitGuard } from './api-key-rate-limit.guard';

@Global()
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
    TypeOrmModule.forFeature([ApiKeyEntity, UserEntity, TenantMembershipEntity]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    ApiKeyRateLimitGuard,
    ApiKeyGuard,
    JwtOnlyAuthGuard,
    JwtAuthGuard,
  ],
  exports: [
    AuthService,
    ApiKeyGuard,
    ApiKeyRateLimitGuard,
    JwtOnlyAuthGuard,
    JwtAuthGuard,
    JwtStrategy,
  ],
})
export class AuthModule {}
