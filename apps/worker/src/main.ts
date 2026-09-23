import { Queue, Worker } from 'bullmq';
import { config } from './config';
import { processEvent } from './processors/events.processor';
import { processWebhook } from './processors/webhooks.processor';
import {
  closeNotificationProcessor,
  processNotification,
} from './processors/notifications.processor';
import { createScheduledAutomationProcessor } from './processors/automation.processor';
import { processImport } from './processors/import.processor';

const connection = {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
};

const workers: Worker[] = [];
const queues: Queue[] = [];

function createWorkers(): void {
  const eventsWorker = new Worker(config.queues.events.name, processEvent, {
    connection,
    concurrency: config.queues.events.concurrency,
  });
  workers.push(eventsWorker);

  const webhooksWorker = new Worker(config.queues.webhooks.name, processWebhook, {
    connection,
    concurrency: config.queues.webhooks.concurrency,
  });
  workers.push(webhooksWorker);

  const notificationsWorker = new Worker(config.queues.notifications.name, processNotification, {
    connection,
    concurrency: config.queues.notifications.concurrency,
  });
  workers.push(notificationsWorker);

  const automationsQueue = new Queue(config.queues.automations.name, { connection });
  queues.push(automationsQueue);
  const scheduledAutomationsWorker = new Worker(
    config.queues.scheduledAutomations.name,
    createScheduledAutomationProcessor(automationsQueue),
    {
      connection,
      concurrency: config.queues.scheduledAutomations.concurrency,
    },
  );
  workers.push(scheduledAutomationsWorker);

  const importsWorker = new Worker(config.queues.imports.name, processImport, {
    connection,
    concurrency: config.queues.imports.concurrency,
  });
  workers.push(importsWorker);

  for (const worker of workers) {
    worker.on('completed', (job) => {
      console.log(`[${worker.name}] Job ${job.id} completed`);
    });

    worker.on('failed', (job, err) => {
      console.error(`[${worker.name}] Job ${job?.id} failed:`, err.message);
    });
  }

  console.log(`Weaver Worker started with ${workers.length} queue processors`);
  console.log(`Queues: ${workers.map((w) => w.name).join(', ')}`);
}

async function shutdown(): Promise<void> {
  console.log('Shutting down workers...');
  await Promise.all(workers.map((w) => w.close()));
  await Promise.all(queues.map((queue) => queue.close()));
  await closeNotificationProcessor();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

createWorkers();
