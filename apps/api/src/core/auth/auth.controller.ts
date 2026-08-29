import { Controller, Post, Get, Body, Res, UseGuards, BadRequestException } from '@nestjs/common';
import { Response } from 'express';
import { registerSchema, loginSchema } from '@weaver/shared';
import { AuthService } from './auth.service';
import { JwtAuthGuard, JwtOnlyAuthGuard } from './jwt-auth.guard';
import { CurrentUser, RequestUser } from './current-user.decorator';

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
};

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
    res.cookie('weaver_token', data.accessToken, COOKIE_OPTIONS);
    return res.json(data);
  }

  @Post('login')
  async login(@Body() body: unknown, @Res() res: Response) {
    const result = loginSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }

    const data = await this.authService.login(result.data);
    res.cookie('weaver_token', data.accessToken, COOKIE_OPTIONS);
    return res.json(data);
  }

  @Post('refresh')
  @UseGuards(JwtOnlyAuthGuard)
  async refresh(@CurrentUser() user: RequestUser, @Res() res: Response) {
    const data = await this.authService.refreshToken(user.userId);
    res.cookie('weaver_token', data.accessToken, COOKIE_OPTIONS);
    return res.json(data);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: RequestUser) {
    return this.authService.getProfile(user.userId);
  }
}
