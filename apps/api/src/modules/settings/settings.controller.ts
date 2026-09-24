import { redactSettingsSecrets, preserveSettingsSecrets } from '../../core/security/settings-secrets';
import { Controller, Get, Patch, Post, Body, UseGuards } from '@nestjs/common';
import { testSmtpSettingsSchema, updateTenantSettingsSchema } from '@weaver/shared';
import { JwtAuthGuard, AdminGuard, CurrentUser, RequestUser } from '../../core/auth';
import { ZodValidationPipe } from '../../common';
import { TenantService } from '../../core/tenant/tenant.service';
import { MailService } from '../mail/mail.service';
import { Audit } from '../audit';

@Controller('settings')
@UseGuards(JwtAuthGuard, AdminGuard)
export class SettingsController {
  constructor(
    private readonly tenantService: TenantService,
    private readonly mailService: MailService,
  ) {}

  @Get()
  async getSettings(@CurrentUser() user: RequestUser) {
    return redactSettingsSecrets(await this.tenantService.getSettings(user.tenantId));
  }

  @Patch()
  @Audit({
    action: 'settings.updated',
    resource: 'settings',
    captureBefore: true,
    resourceId: ({ request }) => request.user?.tenantId,
  })
  async updateSettings(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(updateTenantSettingsSchema)) dto: any,
  ) {
    return redactSettingsSecrets(await this.tenantService.updateSettings(user.tenantId, dto));
  }

  @Post('smtp/test')
  @Audit({
    action: 'settings.smtp_tested',
    resource: 'settings',
    resourceId: ({ request }) => request.user?.tenantId,
  })
  async testSmtp(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(testSmtpSettingsSchema)) body: any,
  ) {
    const current = await this.tenantService.getSettings(user.tenantId);
    await this.mailService.sendTestEmail(user.tenantId, user.email, preserveSettingsSecrets(body.smtp, current.smtp));
    return { success: true, message: 'Test email sent' };
  }
}
