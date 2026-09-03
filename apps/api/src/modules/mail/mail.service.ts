import { Injectable, Logger } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import * as Handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';
import { TenantService } from '../../core/tenant/tenant.service';
import { resolveSafeOutboundHost } from '../../core/security/outbound-http';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly tenantService: TenantService) {}

  async sendMail(
    tenantId: string,
    options: { to: string; subject: string; template: string; context?: Record<string, unknown> },
  ): Promise<void> {
    const settings = await this.tenantService.getSettings(tenantId);
    if (!settings.smtp) {
      this.logger.warn(`SMTP not configured for tenant ${tenantId}, skipping email`);
      return;
    }

    const { smtp } = settings;
    const [destination] = await resolveSafeOutboundHost(smtp.host);
    const transport = createTransport({
      host: destination.address,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.pass },
      tls: {
        servername: smtp.host,
      },
    });

    const templatePath = path.join(__dirname, 'templates', `${options.template}.hbs`);
    const templateSource = fs.readFileSync(templatePath, 'utf-8');
    const compiled = Handlebars.compile(templateSource);
    const html = compiled(options.context || {});

    await transport.sendMail({
      from: `"${smtp.fromName}" <${smtp.fromEmail}>`,
      to: options.to,
      subject: options.subject,
      html,
    });
  }

  async sendTestEmail(tenantId: string, toEmail: string): Promise<void> {
    await this.sendMail(tenantId, {
      to: toEmail,
      subject: 'Weaver — SMTP Test',
      template: 'test',
      context: { email: toEmail },
    });
  }
}
