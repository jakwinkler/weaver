import { Job } from 'bullmq';

export interface WebhookJobData {
  webhookId: string;
  url: string;
  secret: string;
  eventType: string;
  payload: Record<string, unknown>;
  attempt: number;
}

export async function processWebhook(job: Job<WebhookJobData>): Promise<void> {
  const { url, eventType, attempt } = job.data;
  console.log(`[webhooks] Delivering ${eventType} to ${url} (attempt ${attempt})`);
  // Future: HMAC-SHA256 signing, HTTP delivery, retry logic
}
