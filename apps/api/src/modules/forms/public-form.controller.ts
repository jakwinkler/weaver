import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { publicFormSubmissionSchema } from '@weaver/shared';
import type { Request } from 'express';
import { ZodValidationPipe } from '../../common';
import { RateLimit } from '../../core/rate-limiting';
import { tenantStorage } from '../../core/tenant/tenant.context';
import { TenantConnectionProvider } from '../../core/tenant/tenant-connection.provider';
import { TenantService } from '../../core/tenant/tenant.service';
import { FormsService } from './forms.service';

@Controller('public/:tenantSlug/forms')
export class PublicFormController {
  constructor(
    private readonly formsService: FormsService,
    private readonly tenantService: TenantService,
    private readonly tenantConnections: TenantConnectionProvider,
    private readonly config: ConfigService,
  ) {}

  @Get(':formSlug')
  async getForm(@Param('tenantSlug') tenantSlug: string, @Param('formSlug') formSlug: string) {
    return this.withTenant(tenantSlug, async () => {
      const form = await this.formsService.getPublicForm(formSlug);
      return {
        name: form.name,
        description: form.description,
        fields: form.fields,
        captchaSiteKey: this.config.get<string>('RECAPTCHA_SECRET_KEY')
          ? this.config.get<string>('RECAPTCHA_SITE_KEY') || undefined
          : undefined,
      };
    });
  }

  @Post(':formSlug/submit')
  @RateLimit(10, 60_000)
  async submit(
    @Param('tenantSlug') tenantSlug: string,
    @Param('formSlug') formSlug: string,
    @Body(new ZodValidationPipe(publicFormSubmissionSchema)) dto: any,
    @Req() request: Request,
  ) {
    if (dto.website?.trim()) {
      throw new BadRequestException('Submission rejected');
    }

    await this.verifyRecaptcha(dto.recaptchaToken, request.ip);
    return this.withTenant(tenantSlug, () => this.formsService.submitPublicForm(formSlug, dto));
  }

  private async withTenant<T>(tenantSlug: string, fn: () => Promise<T>): Promise<T> {
    const tenant = await this.tenantService.findBySlug(tenantSlug);
    if (!tenant) throw new NotFoundException('Organization not found');

    await this.tenantConnections.getConnection(tenant.schemaName);
    return new Promise((resolve, reject) => {
      tenantStorage.run({ tenantId: tenant.id, schemaName: tenant.schemaName }, () =>
        fn().then(resolve).catch(reject),
      );
    });
  }

  private async verifyRecaptcha(token?: string, remoteIp?: string): Promise<void> {
    const secret = this.config.get<string>('RECAPTCHA_SECRET_KEY');
    if (!secret) return;
    if (!token) throw new BadRequestException('CAPTCHA verification is required');

    try {
      const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          secret,
          response: token,
          ...(remoteIp ? { remoteip: remoteIp } : {}),
        }),
      });
      if (!response.ok) throw new Error(`reCAPTCHA returned ${response.status}`);
      const result = (await response.json()) as { success?: boolean };
      if (!result.success) throw new BadRequestException('CAPTCHA verification failed');
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new ServiceUnavailableException('CAPTCHA verification is temporarily unavailable');
    }
  }
}
