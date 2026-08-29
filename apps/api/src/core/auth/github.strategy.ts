import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-github2';
import { OAuthIdentity } from './auth.service';

@Injectable()
export class GitHubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(config: ConfigService) {
    const apiUrl = config.get<string>('API_PUBLIC_URL', 'http://localhost:3000');
    const prefix = config.get<string>('API_PREFIX', 'api/v1');
    super({
      clientID: config.get<string>('GITHUB_CLIENT_ID') || 'not-configured',
      clientSecret: config.get<string>('GITHUB_CLIENT_SECRET') || 'not-configured',
      callbackURL:
        config.get<string>('GITHUB_CALLBACK_URL') || `${apiUrl}/${prefix}/auth/github/callback`,
      scope: ['user:email'],
      allRawEmails: true,
    });
  }

  validate(_accessToken: string, _refreshToken: string, profile: Profile): OAuthIdentity {
    const emails = profile.emails as
      | Array<{
          value: string;
          verified?: boolean;
          primary?: boolean;
        }>
      | undefined;
    const email =
      emails?.find((item) => item.primary && item.verified)?.value ??
      emails?.find((item) => item.verified)?.value;
    if (!email) {
      throw new UnauthorizedException('GitHub did not return an email address');
    }

    return {
      provider: 'github',
      email,
      displayName: profile.displayName || profile.username || email,
      avatarUrl: profile.photos?.[0]?.value ?? null,
    };
  }
}
