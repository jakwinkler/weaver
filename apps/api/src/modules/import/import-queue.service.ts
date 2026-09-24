import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue } from 'bullmq';
import { sealImportJob } from '@weaver/server-common';
import type { JiraImportJobData, SealedJiraImportJobData } from '@weaver/shared';

@Injectable()
export class ImportQueueService implements OnModuleDestroy {
  private readonly queue: Queue<SealedJiraImportJobData>;

  constructor(private readonly config: ConfigService) {
    this.queue = new Queue<SealedJiraImportJobData>('jira-import', {
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

  async enqueue(data: JiraImportJobData): Promise<Job<SealedJiraImportJobData>> {
    const payload = sealImportJob(data, `${data.tenantId}:${data.importJobId}`, this.config.get<string>('IMPORT_CREDENTIAL_KEY'));
    return this.queue.add('jira-import', { version: 1, tenantId: data.tenantId, importJobId: data.importJobId, payload }, { jobId: data.importJobId });
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
