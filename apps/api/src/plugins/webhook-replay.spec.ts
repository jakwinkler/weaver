/* eslint-disable @typescript-eslint/no-require-imports -- Exercise bundled plugin handlers. */
import { createHmac } from 'crypto';
const {
  handleGitHubWebhook,
} = require('../../../../plugins/plugin-github/src/server/webhook.handler');
const {
  handleGitLabWebhook,
} = require('../../../../plugins/plugin-gitlab/src/server/webhook.handler');
const {
  handleBitbucketWebhook,
} = require('../../../../plugins/plugin-bitbucket/src/server/webhook.handler');

const providers = [
  {
    handler: handleGitHubWebhook,
    eventHeader: 'x-github-event',
    event: 'push',
    signature: 'x-hub-signature-256',
    body: {
      ref: 'refs/heads/main',
      commits: [
        { message: 'TEST-1 fix', url: 'https://example.com/commit', author: { name: 'Matt' } },
      ],
    },
  },
  {
    handler: handleGitLabWebhook,
    eventHeader: 'x-gitlab-event',
    event: 'Push Hook',
    signature: 'x-gitlab-token',
    body: {
      ref: 'refs/heads/main',
      commits: [
        { message: 'TEST-1 fix', url: 'https://example.com/commit', author: { name: 'Matt' } },
      ],
    },
  },
  {
    handler: handleBitbucketWebhook,
    eventHeader: 'x-event-key',
    event: 'repo:push',
    signature: 'x-hub-signature',
    body: {
      push: {
        changes: [
          {
            commits: [
              { message: 'TEST-1 fix', links: { html: { href: 'https://example.com/commit' } } },
            ],
          },
        ],
      },
    },
  },
];

describe.each(providers)(
  'SCM webhook $event',
  ({ handler, eventHeader, event, signature, body }) => {
    const secret = 'synthetic-webhook-test-secret';
    function request(data: unknown = body) {
      const rawBody = JSON.stringify(data);
      return {
        rawBody,
        body: data,
        headers: {
          [eventHeader]: event,
          [signature]:
            signature === 'x-gitlab-token'
              ? secret
              : 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex'),
          'x-github-delivery': 'first',
          'x-gitlab-event-uuid': 'first',
          'x-request-uuid': 'first',
        },
      };
    }
    function context() {
      const receipts = new Set<string>();
      return {
        settings: { webhookSecret: secret },
        db: { query: jest.fn().mockResolvedValue([]) },
        logger: { info: jest.fn(), error: jest.fn() },
        events: { emit: jest.fn() },
        webhooks: {
          processOnce: jest.fn(async (digest: string, fn: () => Promise<void>) => {
            if (receipts.has(digest)) return false;
            await fn();
            receipts.add(digest);
            return true;
          }),
        },
      };
    }
    it('deduplicates signed replays even when delivery headers change', async () => {
      const ctx = context();
      const req = request();
      expect((await handler(req, ctx)).status).toBe(200);
      req.headers['x-github-delivery'] = 'different';
      req.headers['x-gitlab-event-uuid'] = 'different';
      req.headers['x-request-uuid'] = 'different';
      expect((await handler(req, ctx)).status).toBe(200);
      expect(ctx.events.emit).toHaveBeenCalledTimes(1);
      expect(ctx.db.query).toHaveBeenCalledTimes(1);
    });
    it.each([null, [], { commits: [{ message: {} }], push: { changes: 'bad' } }])(
      'rejects malformed authenticated payloads: %p',
      async (data) => {
        const ctx = context();
        expect((await handler(request(data), ctx)).status).toBe(400);
        expect(ctx.events.emit).not.toHaveBeenCalled();
        expect(ctx.webhooks.processOnce).not.toHaveBeenCalled();
      },
    );
    it('does not acknowledge a failed write as a completed delivery', async () => {
      const ctx = context();
      ctx.db.query.mockRejectedValueOnce(new Error('database unavailable'));
      await expect(handler(request(), ctx)).rejects.toThrow('database unavailable');
      expect((await handler(request(), ctx)).status).toBe(200);
      expect(ctx.events.emit).toHaveBeenCalledTimes(1);
    });
    it('authenticates before claiming a delivery', async () => {
      const ctx = context();
      const req = request();
      req.headers[signature] = 'invalid';
      expect((await handler(req, ctx)).status).toBe(401);
      expect(ctx.webhooks.processOnce).not.toHaveBeenCalled();
      expect(ctx.events.emit).not.toHaveBeenCalled();
    });
  },
);
