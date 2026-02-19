import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { registerSchema, loginSchema } from '@weaver/shared';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser, RequestUser } from './current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() body: unknown) {
    const result = registerSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }

    return this.authService.register(result.data);
  }

  @Post('login')
  async login(@Body() body: unknown) {
    const result = loginSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }

    return this.authService.login(result.data);
  }

  @Post('refresh')
  @UseGuards(JwtAuthGuard)
  async refresh(@CurrentUser() user: RequestUser) {
    return this.authService.refreshToken(user.userId);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: RequestUser) {
    return this.authService.getProfile(user.userId);
  }
}
