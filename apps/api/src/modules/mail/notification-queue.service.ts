import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { EmailNotificationJobData } from '@weaver/shared';

@Injectable()
export class NotificationQueueService implements OnModuleDestroy {
  private queue: Queue<EmailNotificationJobData> | null = null;

  constructor(private readonly config: ConfigService) {}

  async enqueue(data: EmailNotificationJobData): Promise<void> {
    await this.getQueue().add('email', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1_000 },
      removeOnComplete: 1_000,
      removeOnFail: 5_000,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }

  private getQueue(): Queue<EmailNotificationJobData> {
    if (!this.queue) {
      this.queue = new Queue<EmailNotificationJobData>(
        this.config.get('NOTIFICATIONS_QUEUE_NAME', 'notifications'),
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
