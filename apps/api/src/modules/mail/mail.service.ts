import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { TenantMembershipEntity, UserEntity } from '@weaver/db';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type EmailTemplateName,
  type NotificationPreferenceKey,
  type NotificationPreferences,
  type TenantSettings,
} from '@weaver/shared';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as Handlebars from 'handlebars';
import * as path from 'path';
import { createTransport } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import type { Repository } from 'typeorm';
import { TenantService } from '../../core/tenant/tenant.service';
import { NotificationQueueService } from './notification-queue.service';

export type SmtpSettings = NonNullable<TenantSettings['smtp']>;
export type MailTransportFactory = (
  options: SMTPTransport.Options,
) => Pick<ReturnType<typeof createTransport>, 'sendMail'>;

export const MAIL_TRANSPORT_FACTORY = Symbol('MAIL_TRANSPORT_FACTORY');

const SUBJECTS: Record<EmailTemplateName, (context: Record<string, unknown>) => string> = {
  'issue-assigned': (context) => `[${context.issueKey}] You were assigned: ${context.issueSummary}`,
  'mentioned-in-comment': (context) => `[${context.issueKey}] ${context.actorName} mentioned you`,
  'issue-status-changed': (context) =>
    `[${context.issueKey}] Status changed to ${context.newStatus}`,
  'comment-added': (context) => `[${context.issueKey}] ${context.actorName} added a comment`,
};

interface EnqueueNotificationOptions {
  tenantId: string;
  userId: string;
  preference: NotificationPreferenceKey;
  template: EmailTemplateName;
  context: Record<string, unknown>;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly tenantService: TenantService,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(TenantMembershipEntity)
    private readonly membershipRepo: Repository<TenantMembershipEntity>,
    private readonly notificationQueue: NotificationQueueService,
    private readonly config: ConfigService,
    @Inject(MAIL_TRANSPORT_FACTORY)
    private readonly transportFactory: MailTransportFactory,
  ) {}

  renderTemplate(
    template: EmailTemplateName,
    context: Record<string, unknown>,
  ): { subject: string; html: string; text: string } {
    const templateDirectory = path.join(__dirname, 'templates');
    const htmlSource = fs.readFileSync(
      path.join(templateDirectory, `${template}.html.hbs`),
      'utf8',
    );
    const textSource = fs.readFileSync(
      path.join(templateDirectory, `${template}.text.hbs`),
      'utf8',
    );

    return {
      subject: SUBJECTS[template](context),
      html: Handlebars.compile(htmlSource)(context),
      text: Handlebars.compile(textSource, { noEscape: true })(context),
    };
  }

  async enqueueNotification(options: EnqueueNotificationOptions): Promise<boolean> {
    const membership = await this.membershipRepo.findOneBy({
      tenantId: options.tenantId,
      userId: options.userId,
    });
    if (!membership) {
      this.logger.warn(
        `Email recipient ${options.userId} is not a member of tenant ${options.tenantId}`,
      );
      return false;
    }

    const user = await this.userRepo.findOneBy({ id: options.userId });
    if (!user) {
      this.logger.warn(`Email recipient ${options.userId} does not exist`);
      return false;
    }

    const preferences = this.withPreferenceDefaults(user.notificationPreferences);
    if (!preferences[options.preference]) {
      return false;
    }

    const settings = await this.tenantService.getSettings(options.tenantId);
    if (!settings.smtp && !this.getSystemSmtpSettings()) {
      this.logger.warn(`SMTP not configured for tenant ${options.tenantId}, skipping email`);
      return false;
    }

    const token = this.createUnsubscribeToken(user.id, options.preference);
    const oneClickUnsubscribeUrl = `${this.apiPublicUrl()}/notifications/unsubscribe?token=${encodeURIComponent(token)}`;
    const unsubscribeUrl = `${this.webAppUrl()}/unsubscribe?token=${encodeURIComponent(token)}`;
    const context = {
      ...options.context,
      recipientName: user.displayName || user.email,
      unsubscribeUrl,
    };
    const rendered = this.renderTemplate(options.template, context);

    try {
      await this.notificationQueue.enqueue({
        type: 'email',
        tenantId: options.tenantId,
        userId: user.id,
        to: user.email,
        title: rendered.subject,
        body: rendered.text,
        html: rendered.html,
        headers: {
          'List-Unsubscribe': `<${oneClickUnsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
        data: {
          template: options.template,
          preference: options.preference,
        },
      });
      return true;
    } catch (error) {
      this.logger.warn(`Failed to enqueue email for ${user.id}: ${this.errorMessage(error)}`);
      return false;
    }
  }

  issueUrl(issueKey: string): string {
    return `${this.webAppUrl()}/issues/${encodeURIComponent(issueKey)}`;
  }

  createUnsubscribeToken(userId: string, preference: NotificationPreferenceKey): string {
    const payload = Buffer.from(JSON.stringify({ userId, preference }), 'utf8').toString(
      'base64url',
    );
    const signature = crypto
      .createHmac('sha256', this.unsubscribeSecret())
      .update(payload)
      .digest('base64url');
    return `${payload}.${signature}`;
  }

  async unsubscribe(
    token: string,
  ): Promise<{ success: true; preference: NotificationPreferenceKey }> {
    const { userId, preference } = this.verifyUnsubscribeToken(token);
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) {
      throw new BadRequestException('Invalid unsubscribe token');
    }

    user.notificationPreferences = {
      ...this.withPreferenceDefaults(user.notificationPreferences),
      [preference]: false,
    };
    await this.userRepo.save(user);

    return { success: true, preference };
  }

  async sendTestEmail(
    tenantId: string,
    toEmail: string,
    smtpOverride?: SmtpSettings,
  ): Promise<void> {
    const smtp =
      smtpOverride ??
      (await this.tenantService.getSettings(tenantId)).smtp ??
      this.getSystemSmtpSettings();
    if (!smtp) {
      throw new BadRequestException('SMTP is not configured');
    }

    const transport = this.transportFactory({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
    });
    await transport.sendMail({
      from: `"${smtp.fromName}" <${smtp.fromEmail}>`,
      to: toEmail,
      subject: 'Weaver SMTP Test',
      html: `<p>SMTP is configured correctly for <strong>${Handlebars.escapeExpression(toEmail)}</strong>.</p>`,
      text: `SMTP is configured correctly for ${toEmail}.`,
    });
  }

  private verifyUnsubscribeToken(token: string): {
    userId: string;
    preference: NotificationPreferenceKey;
  } {
    try {
      const [payload, suppliedSignature, extra] = token.split('.');
      if (!payload || !suppliedSignature || extra) {
        throw new Error('Malformed token');
      }

      const expectedSignature = crypto
        .createHmac('sha256', this.unsubscribeSecret())
        .update(payload)
        .digest();
      const actualSignature = Buffer.from(suppliedSignature, 'base64url');
      if (
        actualSignature.length !== expectedSignature.length ||
        !crypto.timingSafeEqual(actualSignature, expectedSignature)
      ) {
        throw new Error('Invalid signature');
      }

      const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
        userId?: unknown;
        preference?: unknown;
      };
      if (
        typeof parsed.userId !== 'string' ||
        typeof parsed.preference !== 'string' ||
        !(parsed.preference in DEFAULT_NOTIFICATION_PREFERENCES)
      ) {
        throw new Error('Invalid payload');
      }

      return {
        userId: parsed.userId,
        preference: parsed.preference as NotificationPreferenceKey,
      };
    } catch {
      throw new BadRequestException('Invalid unsubscribe token');
    }
  }

  private withPreferenceDefaults(
    preferences: Partial<NotificationPreferences> | null | undefined,
  ): NotificationPreferences {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...(preferences ?? {}) };
  }

  private apiPublicUrl(): string {
    const apiUrl = this.config.get('API_PUBLIC_URL', 'http://localhost:3000/api/v1');
    return apiUrl.replace(/\/$/, '');
  }

  private webAppUrl(): string {
    const appUrl = this.config.get('WEB_APP_URL', 'http://localhost:5173');
    return appUrl.replace(/\/$/, '');
  }

  private unsubscribeSecret(): string {
    const secret =
      this.config.get<string>('EMAIL_UNSUBSCRIBE_SECRET') || this.config.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('EMAIL_UNSUBSCRIBE_SECRET or JWT_SECRET must be configured');
    }
    return secret;
  }

  private getSystemSmtpSettings(): SmtpSettings | null {
    const host = this.config.get<string>('SMTP_HOST');
    const fromEmail = this.config.get<string>('SMTP_FROM');
    if (!host || !fromEmail) return null;

    return {
      host,
      port: this.config.get<number>('SMTP_PORT', 587),
      secure: this.config.get<string>('SMTP_SECURE', 'false') === 'true',
      user: this.config.get<string>('SMTP_USER', ''),
      pass: this.config.get<string>('SMTP_PASS', ''),
      fromName: this.config.get<string>('SMTP_FROM_NAME', 'Weaver'),
      fromEmail,
    };
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
