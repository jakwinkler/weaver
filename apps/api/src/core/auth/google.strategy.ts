import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-google-oauth20';
import { OAuthIdentity } from './auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService) {
    const apiUrl = config.get<string>('API_PUBLIC_URL', 'http://localhost:3000');
    const prefix = config.get<string>('API_PREFIX', 'api/v1');
    super({
      clientID: config.get<string>('GOOGLE_CLIENT_ID') || 'not-configured',
      clientSecret: config.get<string>('GOOGLE_CLIENT_SECRET') || 'not-configured',
      callbackURL:
        config.get<string>('GOOGLE_CALLBACK_URL') || `${apiUrl}/${prefix}/auth/google/callback`,
      scope: ['email', 'profile'],
    });
  }

  validate(_accessToken: string, _refreshToken: string, profile: Profile): OAuthIdentity {
    const email = profile.emails?.find((item) => item.verified)?.value;
    if (!email) {
      throw new UnauthorizedException('Google did not return a verified email address');
    }

    return {
      provider: 'google',
      email,
      displayName: profile.displayName || email,
      avatarUrl: profile.photos?.[0]?.value ?? null,
    };
  }
}
