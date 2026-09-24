import type { Worker } from 'bullmq';

export function attachWorkerLogging(worker: Worker): void {
  worker.on('completed', (job) => {
    console.log(`[${worker.name}] Job ${job.id} completed`);
  });
  worker.on('failed', (job, error) => {
    console.error(`[${worker.name}] Job ${job?.id} failed:`, error.message);
  });
  worker.on('error', (error: Error & { code?: string }) => {
    // Connection errors can contain credentials/URLs. Record classification, not raw payloads.
    console.error('Worker connection error', {
      queue: worker.name,
      name: error.name,
      code: error.code,
    });
  });
}
