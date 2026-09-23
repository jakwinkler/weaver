import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { WebhookDeliveryJobData } from '@weaver/shared';

@Injectable()
export class WebhookQueueService implements OnModuleDestroy {
  private readonly queue: Queue<WebhookDeliveryJobData>;

  constructor(config: ConfigService) {
    this.queue = new Queue<WebhookDeliveryJobData>('webhooks', {
      connection: {
        host: config.get('REDIS_HOST', 'localhost'),
        port: config.get<number>('REDIS_PORT', 6380),
        password: config.get<string>('REDIS_PASSWORD') || undefined,
        enableOfflineQueue: false,
        connectTimeout: 1000,
      },
    });
  }

  async enqueue(data: WebhookDeliveryJobData): Promise<void> {
    await this.queue.add('deliver', data, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
