import { Global, Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ApiKeyEntity,
  UserEntity,
  TenantMembershipEntity,
  RefreshSessionEntity,
  OrganizationInvitationEntity,
  PasswordResetTokenEntity,
} from '@weaver/db';
import { MailModule } from '../../modules/mail/mail.module';
import { WebSocketModule } from '../websocket/websocket.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard, JwtOnlyAuthGuard } from './jwt-auth.guard';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeyRateLimitGuard } from './api-key-rate-limit.guard';
import { GoogleStrategy } from './google.strategy';
import { GitHubStrategy } from './github.strategy';
import { GoogleOAuthGuard, GitHubOAuthGuard } from './oauth.guard';
import { SamlRequestCache } from './saml-request-cache';
import { SamlStrategy } from './saml.strategy';
import { SamlAuthGuard } from './saml.guard';
import { OidcStrategy } from './oidc.strategy';
import { PasswordResetService } from './password-reset.service';

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
    TypeOrmModule.forFeature([
      ApiKeyEntity,
      UserEntity,
      TenantMembershipEntity,
      RefreshSessionEntity,
      OrganizationInvitationEntity,
      PasswordResetTokenEntity,
    ]),
    MailModule,
    WebSocketModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordResetService,
    JwtStrategy,
    ApiKeyRateLimitGuard,
    ApiKeyGuard,
    JwtOnlyAuthGuard,
    JwtAuthGuard,
    GoogleStrategy,
    GitHubStrategy,
    GoogleOAuthGuard,
    GitHubOAuthGuard,
    SamlRequestCache,
    SamlStrategy,
    SamlAuthGuard,
    OidcStrategy,
  ],
  exports: [
    JwtModule,
    AuthService,
    ApiKeyGuard,
    ApiKeyRateLimitGuard,
    JwtOnlyAuthGuard,
    JwtAuthGuard,
    JwtStrategy,
  ],
})
export class AuthModule {}
