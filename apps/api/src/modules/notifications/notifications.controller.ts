import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Query,
  Body,
  BadRequestException,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard, CurrentUser, RequestUser } from '../../core/auth';
import { MailService } from '../mail';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async findAll(
    @CurrentUser() user: RequestUser,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    return this.notificationsService.findForUser(
      user.userId,
      page ? parseInt(page, 10) : 1,
      perPage ? parseInt(perPage, 10) : 20,
    );
  }

  @Get('unread-count')
  async getUnreadCount(@CurrentUser() user: RequestUser) {
    const count = await this.notificationsService.getUnreadCount(user.userId);
    return { count };
  }

  @Patch(':id/read')
  async markRead(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.notificationsService.markRead(id, user.userId);
  }

  @Post('mark-all-read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markAllRead(@CurrentUser() user: RequestUser) {
    await this.notificationsService.markAllRead(user.userId);
  }
}

@Controller('notifications')
export class EmailUnsubscribeController {
  constructor(private readonly mailService: MailService) {}

  @Post('unsubscribe')
  async unsubscribeOneClick(
    @Query('token') queryToken: string | undefined,
    @Body() body: { token?: string } | undefined,
  ) {
    const token = queryToken || body?.token;
    if (!token) {
      throw new BadRequestException('Unsubscribe token is required');
    }
    return this.mailService.unsubscribe(token);
  }
}
