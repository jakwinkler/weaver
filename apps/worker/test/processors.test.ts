import { describe, it, expect, vi } from 'vitest';
import { processEvent, type EventJobData } from '../src/processors/events.processor';
import { processWebhook, type WebhookJobData } from '../src/processors/webhooks.processor';
import { processNotification, type NotificationJobData } from '../src/processors/notifications.processor';
import type { Job } from 'bullmq';

function mockJob<T>(data: T): Job<T> {
  return { data, id: 'test-job-1' } as unknown as Job<T>;
}

describe('Worker Processors', () => {
  describe('Events Processor', () => {
    it('should process event job without errors', async () => {
      const job = mockJob<EventJobData>({
        eventType: 'issue.created',
        tenantId: 'tenant-1',
        payload: { issueKey: 'WEB-1' },
        timestamp: new Date().toISOString(),
      });

      await expect(processEvent(job)).resolves.toBeUndefined();
    });
  });

  describe('Webhooks Processor', () => {
    it('should process webhook job without errors', async () => {
      const job = mockJob<WebhookJobData>({
        webhookId: 'wh-1',
        url: 'https://example.com/webhook',
        secret: 'test-secret',
        eventType: 'issue.created',
        payload: { issueKey: 'WEB-1' },
        attempt: 1,
      });

      await expect(processWebhook(job)).resolves.toBeUndefined();
    });
  });

  describe('Notifications Processor', () => {
    it('should process notification job without errors', async () => {
      const job = mockJob<NotificationJobData>({
        type: 'in_app',
        userId: 'user-1',
        tenantId: 'tenant-1',
        title: 'New comment',
        body: 'Someone commented on WEB-1',
      });

      await expect(processNotification(job)).resolves.toBeUndefined();
    });
  });
});
