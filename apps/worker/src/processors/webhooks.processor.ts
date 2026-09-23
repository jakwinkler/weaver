import { createHmac } from 'crypto';
import { Job } from 'bullmq';
import { DataSource } from 'typeorm';
import { WebhookEntity } from '@weaver/db';
import type { WebhookDeliveryJobData } from '@weaver/shared';
import { config } from '../config';
import { fetchWithSafeRedirects, readLimitedText } from '../security/outbound-http';

export type WebhookJobData = WebhookDeliveryJobData;

interface ProcessorDependencies {
  createDataSource?: (schemaName: string) => DataSource;
  fetcher?: typeof fetch;
  now?: () => number;
}

function createTenantDataSource(schemaName: string): DataSource {
  return new DataSource({
    type: 'postgres',
    ...config.database,
    schema: schemaName,
    entities: [WebhookEntity],
    synchronize: false,
    logging: false,
  });
}

export async function processWebhook(
  job: Job<WebhookJobData>,
): Promise<void> {
  return processWebhookWithDependencies(job);
}

export async function processWebhookWithDependencies(
  job: Job<WebhookJobData>,
  dependencies: ProcessorDependencies = {},
): Promise<void> {
  const { schemaName, webhookId, eventType, payload } = job.data;
  if (!/^tenant_[a-z0-9_]+$/.test(schemaName)) {
    throw new Error('Invalid tenant schema in webhook job');
  }

  const dataSource = (dependencies.createDataSource ?? createTenantDataSource)(schemaName);
  await dataSource.initialize();
  try {
    const repo = dataSource.getRepository(WebhookEntity);
    const webhook = await repo.findOneBy({ id: webhookId });
    if (!webhook || !webhook.active) return;

    const body = JSON.stringify(payload);
    const timestamp = Math.floor((dependencies.now?.() ?? Date.now()) / 1000).toString();
    const signature = createHmac('sha256', webhook.secret)
      .update(`${timestamp}.${body}`)
      .digest('hex');
    let status: number | null = null;
    let responseBody: string | null = null;
    let success = false;
    let failure: unknown;

    try {
      const response = await fetchWithSafeRedirects(
        webhook.url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signature,
            'X-Webhook-Timestamp': timestamp,
            'X-Webhook-Event': eventType,
          },
          body,
          signal: AbortSignal.timeout(10000),
        },
        dependencies.fetcher,
      );
      status = response.status;
      responseBody = await readLimitedText(response, 64 * 1024);
      success = response.ok;
      if (!success) failure = new Error(`Webhook returned HTTP ${response.status}`);
    } catch (error) {
      failure = error;
      responseBody = error instanceof Error ? error.message : String(error);
    }

    await dataSource.query(
      `INSERT INTO webhook_deliveries
       (webhook_id, event, payload, response_status, response_body, success, delivered_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [webhookId, eventType, JSON.stringify(payload), status, responseBody, success],
    );

    if (!success) {
      const attempts = typeof job.opts.attempts === 'number' ? job.opts.attempts : 1;
      if (job.attemptsMade + 1 >= attempts) {
        webhook.active = false;
        await repo.save(webhook);
      }
      throw failure;
    }
  } finally {
    await dataSource.destroy();
  }
}
