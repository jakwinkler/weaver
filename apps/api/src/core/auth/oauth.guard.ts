import {
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';
import { randomBytes, timingSafeEqual } from 'crypto';

const STATE_MAX_AGE_MS = 10 * 60 * 1000;

class OAuthGuardSupport {
  constructor(
    private readonly config: ConfigService,
    private readonly strategyName: 'google' | 'github',
    private readonly scopes: string[],
  ) {}

  beforeActivate(context: ExecutionContext) {
    const key = this.strategyName.toUpperCase();
    if (
      !this.config.get<string>(`${key}_CLIENT_ID`) ||
      !this.config.get<string>(`${key}_CLIENT_SECRET`)
    ) {
      throw new ServiceUnavailableException(`${this.strategyName} OAuth is not configured`);
    }

    const request = context.switchToHttp().getRequest<Request>();
    if (this.isCallback(request)) {
      this.validateState(request, context.switchToHttp().getResponse<Response>());
    }
  }

  getAuthenticateOptions(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    if (this.isCallback(request)) {
      return { scope: this.scopes, session: false };
    }

    const state = randomBytes(32).toString('hex');
    const response = context.switchToHttp().getResponse<Response>();
    response.cookie(this.cookieName, state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.get<string>('NODE_ENV') === 'production',
      maxAge: STATE_MAX_AGE_MS,
      path: '/',
    });
    return { scope: this.scopes, state, session: false };
  }

  private isCallback(request: Request) {
    return 'code' in request.query || 'error' in request.query;
  }

  private validateState(request: Request, response: Response) {
    const received = typeof request.query.state === 'string' ? request.query.state : '';
    const stored =
      request.cookies?.[this.cookieName] ?? this.readCookieHeader(request, this.cookieName);
    response.clearCookie(this.cookieName, { path: '/' });

    const receivedBuffer = Buffer.from(received);
    const storedBuffer = Buffer.from(stored ?? '');
    if (
      !received ||
      !stored ||
      receivedBuffer.length !== storedBuffer.length ||
      !timingSafeEqual(receivedBuffer, storedBuffer)
    ) {
      throw new UnauthorizedException('Invalid OAuth state');
    }
  }

  private readCookieHeader(request: Request, name: string) {
    const cookie = request.headers.cookie
      ?.split(';')
      .find((item) => item.trim().startsWith(`${name}=`));
    return cookie ? decodeURIComponent(cookie.trim().slice(name.length + 1)) : undefined;
  }

  private get cookieName() {
    return `weaver_${this.strategyName}_state`;
  }
}

@Injectable()
export class GoogleOAuthGuard extends AuthGuard('google') {
  private readonly support: OAuthGuardSupport;

  constructor(config: ConfigService) {
    super();
    this.support = new OAuthGuardSupport(config, 'google', ['email', 'profile']);
  }

  canActivate(context: ExecutionContext) {
    this.support.beforeActivate(context);
    return super.canActivate(context);
  }

  getAuthenticateOptions(context: ExecutionContext) {
    return this.support.getAuthenticateOptions(context);
  }
}

@Injectable()
export class GitHubOAuthGuard extends AuthGuard('github') {
  private readonly support: OAuthGuardSupport;

  constructor(config: ConfigService) {
    super();
    this.support = new OAuthGuardSupport(config, 'github', ['user:email']);
  }

  canActivate(context: ExecutionContext) {
    this.support.beforeActivate(context);
    return super.canActivate(context);
  }

  getAuthenticateOptions(context: ExecutionContext) {
    return this.support.getAuthenticateOptions(context);
  }
}
