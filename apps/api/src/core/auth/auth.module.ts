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
import { GoogleStrategy } from './google.strategy';
import { GitHubStrategy } from './github.strategy';
import { GoogleOAuthGuard, GitHubOAuthGuard } from './oauth.guard';
import { SamlStrategy } from './saml.strategy';
import { SamlAuthGuard } from './saml.guard';
import { OidcStrategy } from './oidc.strategy';

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
    GoogleStrategy,
    GitHubStrategy,
    GoogleOAuthGuard,
    GitHubOAuthGuard,
    SamlStrategy,
    SamlAuthGuard,
    OidcStrategy,
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
