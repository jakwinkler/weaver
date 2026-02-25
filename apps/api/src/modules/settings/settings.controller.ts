import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { updateTenantSettingsSchema } from '@weaver/shared';
import { JwtAuthGuard, AdminGuard, CurrentUser, RequestUser } from '../../core/auth';
import { ZodValidationPipe } from '../../common';
import { TenantService } from '../../core/tenant/tenant.service';
import { MailService } from '../mail/mail.service';

@Controller('settings')
@UseGuards(JwtAuthGuard, AdminGuard)
export class SettingsController {
  constructor(
    private readonly tenantService: TenantService,
    private readonly mailService: MailService,
  ) {}

  @Get()
  async getSettings(@CurrentUser() user: RequestUser) {
    return this.tenantService.getSettings(user.tenantId);
  }

  @Patch()
  async updateSettings(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(updateTenantSettingsSchema)) dto: any,
  ) {
    return this.tenantService.updateSettings(user.tenantId, dto);
  }

  @Post('smtp/test')
  async testSmtp(@CurrentUser() user: RequestUser) {
    await this.mailService.sendTestEmail(user.tenantId, user.email);
    return { success: true, message: 'Test email sent' };
  }
}
