import { describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import { processWebhookWithDependencies, type WebhookJobData } from './webhooks.processor';

function webhookJob(overrides: Partial<Job<WebhookJobData>> = {}): Job<WebhookJobData> {
  return {
    id: '42',
    data: {
      webhookId: 'wh-1',
      tenantId: 'tenant-1',
      schemaName: 'tenant_acme',
      eventType: 'issue.created',
      payload: { issueKey: 'WEB-1' },
    },
    opts: { attempts: 5 },
    attemptsMade: 0,
    ...overrides,
  } as unknown as Job<WebhookJobData>;
}

function fakeDataSource(query = vi.fn().mockResolvedValue(undefined)) {
  const webhook = { id: 'wh-1', active: true, url: 'https://1.1.1.1/webhook', secret: 'a'.repeat(32) };
  const save = vi.fn().mockResolvedValue(undefined);
  return {
    webhook,
    save,
    dataSource: {
      initialize: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn().mockResolvedValue(undefined),
      getRepository: vi.fn().mockReturnValue({ findOneBy: vi.fn().mockResolvedValue(webhook), save }),
      query,
    },
  };
}

describe('webhook delivery processor', () => {
  it('records the delivery in the tenant schema and sends a stable delivery id', async () => {
    const { dataSource } = fakeDataSource();
    const fetcher = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));

    await processWebhookWithDependencies(webhookJob(), {
      createDataSource: () => dataSource as never,
      fetcher,
    });

    expect(dataSource.query).toHaveBeenCalledOnce();
    const [sql, params] = dataSource.query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO "tenant_acme"\."webhook_deliveries"/);
    expect(params).toEqual(['wh-1', 'issue.created', JSON.stringify({ issueKey: 'WEB-1' }), 200, 'ok', true]);
    const headers = new Headers(fetcher.mock.calls[0][1].headers);
    expect(headers.get('X-Webhook-Delivery')).toBe('42');
  });

  it('does not throw (and so does not redeliver) when recording fails after a 2xx', async () => {
    const { dataSource, save } = fakeDataSource(vi.fn().mockRejectedValue(new Error('relation does not exist')));
    const fetcher = vi.fn().mockResolvedValue(new Response('ok', { status: 202 }));
    const logger = { error: vi.fn() };

    await expect(processWebhookWithDependencies(webhookJob(), {
      createDataSource: () => dataSource as never,
      fetcher,
      logger,
    })).resolves.toBeUndefined();

    expect(fetcher).toHaveBeenCalledOnce();
    expect(save).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      'Webhook delivery could not be recorded',
      expect.objectContaining({ jobId: '42', webhookId: 'wh-1', schemaName: 'tenant_acme' }),
    );
    expect(dataSource.destroy).toHaveBeenCalled();
  });

  it('still fails a non-2xx delivery so BullMQ retries it', async () => {
    const { dataSource, save, webhook } = fakeDataSource();
    const fetcher = vi.fn().mockResolvedValue(new Response('nope', { status: 500 }));

    await expect(processWebhookWithDependencies(webhookJob(), {
      createDataSource: () => dataSource as never,
      fetcher,
    })).rejects.toThrow('Webhook returned HTTP 500');

    expect(dataSource.query.mock.calls[0][1]).toEqual(
      ['wh-1', 'issue.created', JSON.stringify({ issueKey: 'WEB-1' }), 500, 'nope', false],
    );
    expect(save).not.toHaveBeenCalled();
    expect(webhook.active).toBe(true);
  });

  it('still fails a non-2xx delivery when recording it also fails', async () => {
    const { dataSource } = fakeDataSource(vi.fn().mockRejectedValue(new Error('db down')));
    const fetcher = vi.fn().mockResolvedValue(new Response('nope', { status: 503 }));

    await expect(processWebhookWithDependencies(webhookJob(), {
      createDataSource: () => dataSource as never,
      fetcher,
      logger: { error: vi.fn() },
    })).rejects.toThrow('Webhook returned HTTP 503');
  });

  it('deactivates the webhook on the final failed attempt', async () => {
    const { dataSource, save, webhook } = fakeDataSource();
    const fetcher = vi.fn().mockResolvedValue(new Response('nope', { status: 500 }));

    await expect(processWebhookWithDependencies(webhookJob({ attemptsMade: 4 }), {
      createDataSource: () => dataSource as never,
      fetcher,
    })).rejects.toThrow('Webhook returned HTTP 500');

    expect(webhook.active).toBe(false);
    expect(save).toHaveBeenCalledWith(webhook);
  });
});
