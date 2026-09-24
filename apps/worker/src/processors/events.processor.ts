import { Job } from 'bullmq';

export interface EventJobData {
  eventType: string;
  tenantId: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export async function processEvent(job: Job<EventJobData>): Promise<void> {
  const { eventType, tenantId } = job.data;
  console.log(`[events] Processing ${eventType} for tenant ${tenantId}`);
  // Future: dispatch to plugin handlers, activity log, etc.
}
