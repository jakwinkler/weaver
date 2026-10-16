import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { AccountEmailJobData } from '@weaver/shared';

/**
 * Account emails get their own queue so a worker that predates them can never send one
 * through an organization's SMTP server. Jobs can hold a reset link, so Redis drops them
 * as soon as they finish or exhaust their retries.
 */
@Injectable()
export class AccountMailQueueService implements OnModuleDestroy {
  private queue: Queue<AccountEmailJobData> | null = null;

  constructor(private readonly config: ConfigService) {}

  async enqueue(data: AccountEmailJobData): Promise<void> {
    await this.getQueue().add(data.template, data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1_000 },
      removeOnComplete: true,
      removeOnFail: true,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }

  private getQueue(): Queue<AccountEmailJobData> {
    if (!this.queue) {
      this.queue = new Queue<AccountEmailJobData>(
        this.config.get('ACCOUNT_MAIL_QUEUE_NAME', 'account-mail'),
        {
          connection: {
            host: this.config.get('REDIS_HOST', 'localhost'),
            port: this.config.get<number>('REDIS_PORT', 6380),
            password: this.config.get<string>('REDIS_PASSWORD') || undefined,
          },
        },
      );
    }

    return this.queue;
  }
}
