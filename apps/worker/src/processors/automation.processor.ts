import { assertTenantSchemaName } from '@weaver/server-common';
import { Job, JobsOptions } from 'bullmq';

export interface ScheduledAutomationJobData {
  tenantId: string;
  schemaName: string;
  ruleId: string;
}

interface AutomationQueue {
  add(
    name: string,
    data: {
      kind: 'schedule';
      tenantId: string;
      schemaName: string;
      ruleId: string;
      scheduledAt: string;
    },
    opts: JobsOptions,
  ): Promise<unknown>;
}

export function createScheduledAutomationProcessor(automationQueue: AutomationQueue) {
  return async (job: Job<ScheduledAutomationJobData>): Promise<void> => {
    assertTenantSchemaName(job.data.schemaName);
    await automationQueue.add(
      'evaluate-schedule',
      {
        kind: 'schedule',
        tenantId: job.data.tenantId,
        schemaName: job.data.schemaName,
        ruleId: job.data.ruleId,
        scheduledAt: new Date(job.processedOn ?? Date.now()).toISOString(),
      },
      { removeOnComplete: true, removeOnFail: 100 },
    );
  };
}
