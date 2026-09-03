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
} from '@nestjs/common';
import { CookieOptions, Request, Response } from 'express';
import { registerSchema, loginSchema } from '@weaver/shared';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser, RequestUser } from './current-user.decorator';

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

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
    res.clearCookie('weaver_token', cookieOptions('/', 0));
    res.clearCookie('weaver_refresh', cookieOptions('/api/v1/auth', 0));
    return res.status(HttpStatus.NO_CONTENT).send();
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: RequestUser) {
    return this.authService.getProfile(user.userId, user.tenantId);
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
      cookieOptions('/api/v1/auth', REFRESH_COOKIE_MAX_AGE_MS),
    );
  }
}
