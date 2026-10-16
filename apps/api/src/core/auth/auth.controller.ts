import { apiPath } from '../security/api-prefix';
import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
  BadRequestException,
  Param,
  Query,
} from '@nestjs/common';
import { CookieOptions, Request, Response } from 'express';
import {
  acceptInvitationSchema,
  confirmPasswordResetSchema,
  createOAuthOrganizationSchema,
  loginSchema,
  registerSchema,
  requestPasswordResetSchema,
  selectOrganizationSchema,
} from '@weaver/shared';
import { z } from 'zod';
import { AuthService, OAuthIdentity } from './auth.service';
import { JwtAuthGuard, JwtOnlyAuthGuard } from './jwt-auth.guard';
import { CurrentUser, RequestUser } from './current-user.decorator';
import { GitHubOAuthGuard, GoogleOAuthGuard } from './oauth.guard';
import { SamlAuthGuard } from './saml.guard';
import { OidcStrategy } from './oidc.strategy';
import { RateLimit } from '../rate-limiting/rate-limiting.guard';
import {
  PASSWORD_RESET_CONFIRMS_PER_WINDOW,
  PASSWORD_RESET_RATE_WINDOW_MS,
  PASSWORD_RESET_REQUESTED_MESSAGE,
  PASSWORD_RESET_REQUESTS_PER_WINDOW,
  PasswordResetService,
} from './password-reset.service';

const ACCESS_COOKIE_MAX_AGE_MS = 15 * 60 * 1000;
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function cookieOptions(path: string, maxAge: number): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path,
    maxAge,
  };
}

function extractRefreshToken(req: Request): string | undefined {
  const authorization = req.headers.authorization;
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i);
  return bearer?.[1] || req.cookies?.weaver_refresh;
}

const OAUTH_CONTEXT_COOKIE = 'weaver_oauth_context';
const OIDC_STATE_COOKIE = 'weaver_oidc_state';

type OAuthRequest = Request & { user: OAuthIdentity };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly oidcStrategy: OidcStrategy,
    private readonly passwordReset: PasswordResetService,
  ) {}

  @Post('register')
  async register(@Body() body: unknown, @Res() res: Response) {
    const result = registerSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }

    const data = await this.authService.register(result.data);
    this.setAuthCookies(res, data.accessToken, data.refreshToken);
    return res.json(data);
  }

  @Post('login')
  async login(@Body() body: unknown, @Res() res: Response) {
    const result = loginSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }

    const data = await this.authService.login(result.data);
    this.setAuthCookies(res, data.accessToken, data.refreshToken);
    return res.json(data);
  }

  @Get('providers')
  providers() {
    return this.authService.getSignInProviders();
  }

  @Get('invitations/:token')
  async getInvitation(@Param('token') token: string) {
    return this.authService.getInvitation(token);
  }

  @Post('invitations/:token/accept')
  async acceptInvitation(@Param('token') token: string, @Body() body: unknown, @Res() res: Response) {
    const result = acceptInvitationSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }
    const data = await this.authService.acceptInvitation(token, result.data);
    this.setAuthCookies(res, data.accessToken, data.refreshToken);
    return res.json(data);
  }

  @Post('password-reset/request')
  @HttpCode(HttpStatus.ACCEPTED)
  @RateLimit(PASSWORD_RESET_REQUESTS_PER_WINDOW, PASSWORD_RESET_RATE_WINDOW_MS)
  requestPasswordReset(@Body() body: unknown) {
    const result = requestPasswordResetSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }
    this.passwordReset.requestReset(result.data.email);
    return { message: PASSWORD_RESET_REQUESTED_MESSAGE };
  }

  @Post('password-reset/confirm')
  @RateLimit(PASSWORD_RESET_CONFIRMS_PER_WINDOW, PASSWORD_RESET_RATE_WINDOW_MS)
  async confirmPasswordReset(@Body() body: unknown, @Req() req: Request, @Res() res: Response) {
    const result = confirmPasswordResetSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }
    await this.passwordReset.confirmReset(result.data.token, result.data.password, req);
    // Every session for the account is gone; drop this browser's cookies too.
    this.clearAuthCookies(res);
    return res.status(HttpStatus.OK).json({
      message: 'Your password was changed. Sign in with your new password.',
    });
  }

  @Post('refresh')
  async refresh(@Req() req: Request, @Res() res: Response) {
    const refreshToken = extractRefreshToken(req);
    if (!refreshToken) {
      throw new BadRequestException('Refresh token required');
    }
    const data = await this.authService.rotateRefreshToken(refreshToken);
    this.setAuthCookies(res, data.accessToken, data.refreshToken);
    return res.json(data);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res() res: Response) {
    await this.authService.revokeRefreshToken(extractRefreshToken(req));
    this.clearAuthCookies(res);
    return res.status(HttpStatus.NO_CONTENT).send();
  }

  @Get('organizations')
  @UseGuards(JwtAuthGuard)
  async organizations(@CurrentUser() user: RequestUser) {
    return this.authService.listOrganizations(user.userId);
  }

  @Post('switch-organization')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async switchOrganization(
    @CurrentUser() user: RequestUser,
    @Body() body: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const result = z.object({ tenantId: z.string().uuid() }).safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }
    const data = await this.authService.switchOrganization(user.userId, result.data.tenantId);
    await this.authService.revokeRefreshToken(extractRefreshToken(req));
    this.setAuthCookies(res, data.accessToken, data.refreshToken);
    return res.json(data);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: RequestUser) {
    return this.authService.getProfile(user.userId, user.tenantId);
  }

  private clearAuthCookies(res: Response): void {
    res.clearCookie('weaver_token', cookieOptions('/', 0));
    res.clearCookie('weaver_refresh', cookieOptions(apiPath('auth'), 0));
  }

  private setAuthCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
  ): void {
    res.cookie(
      'weaver_token',
      accessToken,
      cookieOptions('/', ACCESS_COOKIE_MAX_AGE_MS),
    );
    res.cookie(
      'weaver_refresh',
      refreshToken,
      cookieOptions(apiPath('auth'), REFRESH_COOKIE_MAX_AGE_MS),
    );
  }

  @Get('google')
  @UseGuards(GoogleOAuthGuard)
  googleLogin() {}

  @Get('google/callback')
  @UseGuards(GoogleOAuthGuard)
  async googleCallback(@Req() req: OAuthRequest, @Res() res: Response) {
    return this.completeExternalLogin(req.user, res);
  }

  @Get('github')
  @UseGuards(GitHubOAuthGuard)
  githubLogin() {}

  @Get('github/callback')
  @UseGuards(GitHubOAuthGuard)
  async githubCallback(@Req() req: OAuthRequest, @Res() res: Response) {
    return this.completeExternalLogin(req.user, res);
  }

  @Get('saml/:tenantSlug')
  @UseGuards(SamlAuthGuard)
  samlLogin() {}

  @Post('saml/:tenantSlug/callback')
  @UseGuards(SamlAuthGuard)
  async samlCallback(@Req() req: OAuthRequest, @Res() res: Response) {
    return this.completeExternalLogin(req.user, res);
  }

  @Get('oidc/:tenantSlug')
  async oidcLogin(@Param('tenantSlug') tenantSlug: string, @Res() res: Response) {
    const result = await this.oidcStrategy.begin(tenantSlug);
    res.cookie(OIDC_STATE_COOKIE, result.stateToken, this.transientCookieOptions());
    return res.redirect(result.authorizationUrl);
  }

  @Get('oidc/:tenantSlug/callback')
  async oidcCallback(
    @Param('tenantSlug') tenantSlug: string,
    @Query() query: Record<string, string | string[]>,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const stateToken = this.readCookie(req, OIDC_STATE_COOKIE);
    if (!stateToken) {
      throw new BadRequestException('OIDC session cookie is missing');
    }
    res.clearCookie(OIDC_STATE_COOKIE, { path: '/' });
    const currentUrl = new URL(this.oidcStrategy.callbackUrl(tenantSlug));
    for (const [key, value] of Object.entries(query)) {
      if (Array.isArray(value)) {
        value.forEach((item) => currentUrl.searchParams.append(key, item));
      } else if (typeof value === 'string') {
        currentUrl.searchParams.set(key, value);
      }
    }
    const identity = await this.oidcStrategy.complete(tenantSlug, currentUrl, stateToken);
    return this.completeExternalLogin(identity, res);
  }

  @Get('oauth-context')
  async oauthContext(@Req() req: Request) {
    const context = this.readOAuthContext(req);
    return this.authService.getOAuthContext(context.sub, context.provider);
  }

  @Post('select-organization')
  async selectOrganization(@Body() body: unknown, @Req() req: Request, @Res() res: Response) {
    const parsed = selectOrganizationSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const context = this.readOAuthContext(req);
    const session = await this.authService.selectOrganization(
      context.sub,
      context.provider,
      parsed.data.tenantId,
    );
    this.setSessionCookies(res, session.accessToken, session.refreshToken);
    res.clearCookie(OAUTH_CONTEXT_COOKIE, { path: '/' });
    return res.json(session);
  }

  @Post('oauth-organizations')
  async createOAuthOrganization(@Body() body: unknown, @Req() req: Request, @Res() res: Response) {
    const parsed = createOAuthOrganizationSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const context = this.readOAuthContext(req);
    const session = await this.authService.createOAuthOrganization(context.sub, parsed.data);
    this.setSessionCookies(res, session.accessToken, session.refreshToken);
    res.clearCookie(OAUTH_CONTEXT_COOKIE, { path: '/' });
    return res.json(session);
  }

  @Get('session')
  @UseGuards(JwtOnlyAuthGuard)
  async session(@CurrentUser() user: RequestUser, @Res() res: Response) {
    const profile = await this.authService.getProfile(user.userId, user.tenantId);
    return res.json({ user: profile, tenantId: user.tenantId });
  }

  private async completeExternalLogin(identity: OAuthIdentity, res: Response) {
    const result = await this.authService.completeOAuth(identity);
    const webUrl = process.env.WEB_URL || 'http://localhost:5173';
    if (result.status === 'ready') {
      this.setSessionCookies(res, result.session.accessToken, result.session.refreshToken);
      return res.redirect(`${webUrl}/auth/callback`);
    }

    const contextToken = this.authService.createOAuthContextToken(
      result.user.id,
      identity.provider,
    );
    res.cookie(OAUTH_CONTEXT_COOKIE, contextToken, this.transientCookieOptions());
    return res.redirect(`${webUrl}/auth/organizations`);
  }

  private readOAuthContext(req: Request) {
    const token = this.readCookie(req, OAUTH_CONTEXT_COOKIE);
    if (!token) {
      throw new BadRequestException('OAuth session cookie is missing');
    }
    return this.authService.verifyOAuthContextToken(token);
  }

  private readCookie(req: Request, name: string) {
    if (req.cookies?.[name]) {
      return req.cookies[name] as string;
    }
    const cookie = req.headers.cookie
      ?.split(';')
      .find((item) => item.trim().startsWith(`${name}=`));
    return cookie ? decodeURIComponent(cookie.trim().slice(name.length + 1)) : undefined;
  }

  private setSessionCookies(res: Response, accessToken: string, refreshToken: string) {
    this.setAuthCookies(res, accessToken, refreshToken);
  }

  private transientCookieOptions() {
    return {
      ...cookieOptions('/', 10 * 60 * 1000),
    };
  }
}
