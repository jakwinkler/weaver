import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue } from 'bullmq';
import type { JiraImportJobData } from '@weaver/shared';

@Injectable()
export class ImportQueueService implements OnModuleDestroy {
  private readonly queue: Queue<JiraImportJobData>;

  constructor(config: ConfigService) {
    this.queue = new Queue<JiraImportJobData>('jira-import', {
      connection: {
        host: config.get('REDIS_HOST', 'localhost'),
        port: config.get<number>('REDIS_PORT', 6380),
        password: config.get<string>('REDIS_PASSWORD') || undefined,
      },
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: true,
      },
    });
  }

  async enqueue(data: JiraImportJobData): Promise<Job<JiraImportJobData>> {
    return this.queue.add('jira-import', data, { jobId: data.importJobId });
  }

  async cancel(importJobId: string): Promise<void> {
    const job = await this.queue.getJob(importJobId);
    if (!job) return;
    const state = await job.getState();
    if (state === 'waiting' || state === 'delayed') {
      await job.remove();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
