import { describe, it, expect, vi } from 'vitest';
import { processEvent, type EventJobData } from '../src/processors/events.processor';
import { processWebhook, type WebhookJobData } from '../src/processors/webhooks.processor';
import {
  createNotificationProcessor,
  processNotification,
  TenantEmailRateLimiter,
  type NotificationJobData,
} from '../src/processors/notifications.processor';
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

    it('sends an email job with tenant SMTP settings', async () => {
      const sendMail = vi.fn().mockResolvedValue({ messageId: 'mail-1' });
      const wait = vi.fn().mockResolvedValue(undefined);
      const processor = createNotificationProcessor({
        getTenantSmtpSettings: vi.fn().mockResolvedValue({
          host: 'smtp.example.com',
          port: 587,
          secure: false,
          user: 'smtp-user',
          pass: 'smtp-pass',
          fromName: 'Weaver',
          fromEmail: 'weaver@example.com',
        }),
        getSystemSmtpSettings: vi.fn().mockReturnValue(null),
        transportFactory: vi.fn().mockReturnValue({ sendMail }),
        rateLimiter: { wait },
        logger: { info: vi.fn(), warn: vi.fn() },
      });

      await processor(
        mockJob<NotificationJobData>({
          type: 'email',
          userId: 'user-1',
          tenantId: 'tenant-1',
          to: 'recipient@example.com',
          title: 'You were assigned WEB-42',
          body: 'Open https://weaver.example.com/issues/WEB-42',
          html: '<a href="https://weaver.example.com/issues/WEB-42">Open</a>',
          headers: {
            'List-Unsubscribe': '<https://api.example.com/unsubscribe>',
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        }),
      );

      expect(wait).toHaveBeenCalledWith('tenant-1');
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: '"Weaver" <weaver@example.com>',
          to: 'recipient@example.com',
          subject: 'You were assigned WEB-42',
          text: expect.stringContaining('WEB-42'),
          html: expect.stringContaining('WEB-42'),
        }),
      );
    });

    it('skips cleanly when neither tenant nor system SMTP is configured', async () => {
      const warn = vi.fn();
      const transportFactory = vi.fn();
      const processor = createNotificationProcessor({
        getTenantSmtpSettings: vi.fn().mockResolvedValue(null),
        getSystemSmtpSettings: vi.fn().mockReturnValue(null),
        transportFactory,
        rateLimiter: { wait: vi.fn() },
        logger: { info: vi.fn(), warn },
      });

      await processor(
        mockJob<NotificationJobData>({
          type: 'email',
          userId: 'user-1',
          tenantId: 'tenant-1',
          to: 'recipient@example.com',
          title: 'Email title',
          body: 'Email body',
          html: '<p>Email body</p>',
          headers: {},
        }),
      );

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('tenant-1'));
      expect(transportFactory).not.toHaveBeenCalled();
    });

    it('limits each tenant independently to ten emails per second', async () => {
      let now = 0;
      const sleeps: number[] = [];
      const limiter = new TenantEmailRateLimiter(
        10,
        1_000,
        () => now,
        async (milliseconds) => {
          sleeps.push(milliseconds);
          now += milliseconds;
        },
      );

      for (let index = 0; index < 10; index += 1) {
        await limiter.wait('tenant-1');
      }
      await limiter.wait('tenant-2');
      expect(sleeps).toEqual([]);

      await limiter.wait('tenant-1');
      expect(sleeps).toEqual([1_000]);
    });
  });
});
