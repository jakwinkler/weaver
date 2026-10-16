import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { CurrentUser, JwtOnlyAuthGuard, RequestUser } from '../../core/auth';
import { apiPath } from '../../core/security/api-prefix';
import { ImportPeopleService } from './import-people.service';

@Controller('auth/import-invitations')
export class ImportInvitationController {
  constructor(private readonly people: ImportPeopleService) {}
  @Get(':token') preview(@Param('token') token: string) {
    return this.people.preview(token);
  }
  @Post(':token/accept')
  async accept(@Param('token') token: string, @Body() body: unknown, @Res() res: Response) {
    const parsed = z
      .object({
        password: z.string().min(10).max(200),
        displayName: z.string().trim().min(1).max(255),
      })
      .safeParse(body);
    if (!parsed.success) throw new BadRequestException('A name and password are required');
    return this.respond(res, await this.people.accept(token, parsed.data));
  }
  @Post(':token/claim')
  @UseGuards(JwtOnlyAuthGuard)
  async claim(
    @Param('token') token: string,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    return this.respond(res, await this.people.accept(token, {}, user.userId));
  }
  private respond(res: Response, session: Awaited<ReturnType<ImportPeopleService['accept']>>) {
    const options = {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: process.env.NODE_ENV === 'production',
    };
    res.cookie('weaver_token', session.accessToken, { ...options, path: '/', maxAge: 15 * 60_000 });
    res.cookie('weaver_refresh', session.refreshToken, {
      ...options,
      path: apiPath('auth'),
      maxAge: 7 * 86400_000,
    });
    return res.json(session);
  }
}
