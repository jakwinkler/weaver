import * as crypto from 'crypto';
import { WebhookEntity } from '@weaver/db';
import { WebhooksService } from './webhooks.service';
import { fetchWithSafeRedirects } from '../../core/security/outbound-http';

jest.mock('../../core/security/outbound-http', () => ({
  assertSafeOutboundUrl: jest.fn(),
  fetchWithSafeRedirects: jest.fn(),
  readLimitedResponseText: jest.fn().mockResolvedValue('ok'),
}));

describe('WebhooksService delivery signing', () => {
  it('signs a timestamp and body together so receivers can reject replays', async () => {
    const webhook = {
      id: 'webhook-a',
      active: true,
      url: 'https://example.com/hook',
      secret: 'a'.repeat(32),
    };
    const repo = { findOneBy: jest.fn().mockResolvedValue(webhook) };
    const tenantConnections = {
      getEntityManager: jest.fn().mockResolvedValue({
        getRepository: (entity: unknown) => {
          expect(entity).toBe(WebhookEntity);
          return repo;
        },
      }),
      runInTenantTransaction: jest.fn().mockImplementation(async (callback) =>
        callback({ query: jest.fn() }),
      ),
    };
    jest.mocked(fetchWithSafeRedirects).mockResolvedValue(
      new Response('ok', { status: 200 }),
    );
    const service = new WebhooksService(tenantConnections as never, {} as never);

    await service.deliver('webhook-a', 'issue.updated', { issueKey: 'A-1' });

    const [, options] = jest.mocked(fetchWithSafeRedirects).mock.calls[0];
    const headers = options?.headers as Record<string, string>;
    const timestamp = headers['X-Webhook-Timestamp'];
    const body = options?.body as string;
    expect(timestamp).toMatch(/^\d{10}$/);
    expect(headers['X-Webhook-Signature']).toBe(
      crypto
        .createHmac('sha256', webhook.secret)
        .update(`${timestamp}.${body}`)
        .digest('hex'),
    );
  });
});
