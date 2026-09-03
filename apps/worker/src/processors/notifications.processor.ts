import {
  ApiKeyEntity,
  InstalledPluginEntity,
  TenantEntity,
  TenantMembershipEntity,
  UserEntity,
} from '@weaver/db';
import { smtpSettingsSchema, type NotificationJobData, type TenantSettings } from '@weaver/shared';
import { Job } from 'bullmq';
import { createTransport } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { DataSource } from 'typeorm';
import { resolveSafeOutboundHost } from '../security/outbound-http';

export type { NotificationJobData } from '@weaver/shared';

type SmtpSettings = NonNullable<TenantSettings['smtp']>;

interface NotificationProcessorDependencies {
  getTenantSmtpSettings: (tenantId: string) => Promise<SmtpSettings | null>;
  getSystemSmtpSettings: () => SmtpSettings | null;
  transportFactory: (
    options: SMTPTransport.Options,
  ) => Pick<ReturnType<typeof createTransport>, 'sendMail'>;
  rateLimiter: Pick<TenantEmailRateLimiter, 'wait'>;
  logger: {
    info: (message: string) => void;
    warn: (message: string) => void;
  };
}

interface RateLimitBucket {
  count: number;
  windowStartedAt: number;
}

export class TenantEmailRateLimiter {
  private readonly buckets = new Map<string, RateLimitBucket>();

  constructor(
    private readonly max = 10,
    private readonly durationMs = 1_000,
    private readonly now: () => number = Date.now,
    private readonly sleep: (milliseconds: number) => Promise<void> = (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)),
  ) {}

  async wait(tenantId: string): Promise<void> {
    while (true) {
      const currentTime = this.now();
      const bucket = this.buckets.get(tenantId);

      if (!bucket || currentTime - bucket.windowStartedAt >= this.durationMs) {
        this.buckets.set(tenantId, {
          count: 1,
          windowStartedAt: currentTime,
        });
        return;
      }

      if (bucket.count < this.max) {
        bucket.count += 1;
        return;
      }

      await this.sleep(Math.max(1, bucket.windowStartedAt + this.durationMs - currentTime));
    }
  }
}

class TenantSmtpSettingsProvider {
  private dataSource: DataSource | null = null;

  async get(tenantId: string): Promise<SmtpSettings | null> {
    const tenant = await (await this.connection())
      .getRepository(TenantEntity)
      .findOneBy({ id: tenantId });
    const smtp = (tenant?.settings as Partial<TenantSettings> | undefined)?.smtp;
    const parsed = smtpSettingsSchema.safeParse(smtp);
    return parsed.success ? parsed.data : null;
  }

  async close(): Promise<void> {
    if (this.dataSource?.isInitialized) {
      await this.dataSource.destroy();
    }
    this.dataSource = null;
  }

  private async connection(): Promise<DataSource> {
    if (this.dataSource?.isInitialized) return this.dataSource;

    this.dataSource = new DataSource({
      type: 'postgres',
      host: process.env.DATABASE_HOST || 'localhost',
      port: Number.parseInt(process.env.DATABASE_PORT || '5432', 10),
      username: process.env.DATABASE_USER || 'weaver',
      password: process.env.DATABASE_PASSWORD || 'weaver_dev',
      database: process.env.DATABASE_NAME || 'weaver',
      schema: 'public',
      entities: [
        TenantEntity,
        UserEntity,
        TenantMembershipEntity,
        ApiKeyEntity,
        InstalledPluginEntity,
      ],
      synchronize: false,
      logging: false,
    });
    await this.dataSource.initialize();
    return this.dataSource;
  }
}

export function createNotificationProcessor(
  dependencies: NotificationProcessorDependencies,
): (job: Job<NotificationJobData>) => Promise<void> {
  return async (job: Job<NotificationJobData>): Promise<void> => {
    if (job.data.type === 'in_app') {
      dependencies.logger.info(
        `[notifications] Sending in_app notification to user ${job.data.userId}: ${job.data.title}`,
      );
      return;
    }

    const smtp =
      (await dependencies.getTenantSmtpSettings(job.data.tenantId)) ??
      dependencies.getSystemSmtpSettings();
    if (!smtp) {
      dependencies.logger.warn(
        `[notifications] SMTP not configured for tenant ${job.data.tenantId}, skipping email`,
      );
      return;
    }

    await dependencies.rateLimiter.wait(job.data.tenantId);

    const addresses = await resolveSafeOutboundHost(smtp.host);
    const transport = dependencies.transportFactory({
      host: addresses[0].address,
      port: smtp.port,
      secure: smtp.secure,
      tls: { servername: smtp.host },
      auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
    });
    await transport.sendMail({
      from: `"${smtp.fromName}" <${smtp.fromEmail}>`,
      to: job.data.to,
      subject: job.data.title,
      text: job.data.body,
      html: job.data.html,
      headers: job.data.headers,
    });

    dependencies.logger.info(`[notifications] Sent email to user ${job.data.userId}`);
  };
}

function getSystemSmtpSettings(): SmtpSettings | null {
  const candidate = {
    host: process.env.SMTP_HOST,
    port: Number.parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    fromName: process.env.SMTP_FROM_NAME || 'Weaver',
    fromEmail: process.env.SMTP_FROM,
  };
  const parsed = smtpSettingsSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

const smtpSettingsProvider = new TenantSmtpSettingsProvider();
const rateLimiter = new TenantEmailRateLimiter();

export const processNotification = createNotificationProcessor({
  getTenantSmtpSettings: (tenantId) => smtpSettingsProvider.get(tenantId),
  getSystemSmtpSettings,
  transportFactory: createTransport,
  rateLimiter,
  logger: {
    info: (message) => console.log(message),
    warn: (message) => console.warn(message),
  },
});

export async function closeNotificationProcessor(): Promise<void> {
  await smtpSettingsProvider.close();
}
