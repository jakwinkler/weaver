import { describe, it, expect, vi } from 'vitest';
import { processEvent, type EventJobData } from '../src/processors/events.processor';
import {
  processWebhookWithDependencies,
  type WebhookJobData,
} from '../src/processors/webhooks.processor';
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
    it('loads the destination secret from tenant storage and signs the delivery', async () => {
      const job = mockJob<WebhookJobData>({
        webhookId: 'wh-1',
        tenantId: 'tenant-1',
        schemaName: 'tenant_test',
        eventType: 'issue.created',
        payload: { issueKey: 'WEB-1' },
      });
      const fetcher = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
      const webhook = {
        id: 'wh-1',
        active: true,
        url: 'https://1.1.1.1/webhook',
        secret: 'a'.repeat(32),
      };
      const dataSource = {
        initialize: vi.fn().mockResolvedValue(undefined),
        destroy: vi.fn().mockResolvedValue(undefined),
        getRepository: vi.fn().mockReturnValue({
          findOneBy: vi.fn().mockResolvedValue(webhook),
          save: vi.fn(),
        }),
        query: vi.fn().mockResolvedValue(undefined),
      };

      await expect(processWebhookWithDependencies(job, {
        createDataSource: () => dataSource as never,
        fetcher,
        now: () => 1_800_000_000_000,
      })).resolves.toBeUndefined();
      expect(fetcher).toHaveBeenCalledWith(
        expect.any(URL),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Webhook-Timestamp': '1800000000',
          }),
        }),
      );
      expect(dataSource.destroy).toHaveBeenCalled();
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
