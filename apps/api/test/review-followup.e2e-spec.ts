import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createHash, createHmac } from 'crypto';
import { AppModule } from '../src/app.module';
import { TenantConnectionProvider, tenantStorage } from '../src/core/tenant';
import { WorkflowsService } from '../src/modules/workflows/workflows.service';
import { AttachmentsService } from '../src/modules/attachments/attachments.service';
import { AttachmentCleanupService } from '../src/modules/attachments/attachment-cleanup.service';
import { StorageService } from '../src/core/storage';
import { PluginContextFactory } from '../src/plugins/plugin-context.factory';
import { EventDispatcherService } from '../src/modules/events/event-dispatcher.service';
import { InboundWebhookService } from '../src/plugins/inbound-webhook.service';
import { runReviewReliabilityMigration } from '@weaver/db';
/* eslint-disable @typescript-eslint/no-require-imports -- Exercise bundled provider handler. */
const {
  handleGitHubWebhook,
} = require('../../../plugins/plugin-github/src/server/webhook.handler');

describe('Additional review regressions (real PostgreSQL)', () => {
  let app: INestApplication;
  let db: DataSource;
  let connections: TenantConnectionProvider;
  let tenantId: string;
  let token: string;
  let userId: string;
  let issueKey: string;
  const schemaName = 'tenant_review_followup';
  const storageKeys: string[] = [];
  const inTenant = <T>(fn: () => Promise<T>) => tenantStorage.run({ tenantId, schemaName }, fn);
  const http = () => request(app.getHttpServer());
  const auth = (call: request.Test) =>
    call.set('Authorization', `Bearer ${token}`).set('X-Tenant-ID', tenantId);

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api/v1');
    await app.init();
    db = app.get(DataSource);
    connections = app.get(TenantConnectionProvider);
    const registered = await http()
      .post('/api/v1/auth/register')
      .send({
        email: 'review-followup@example.com',
        password: 'password123',
        displayName: 'Review Test',
        orgName: 'Review Followup',
        orgSlug: 'review-followup',
      })
      .expect(201);
    token = registered.body.accessToken;
    tenantId = registered.body.tenantId;
    userId = registered.body.user.id;
    await auth(http().post('/api/v1/projects'))
      .send({ key: 'FOLLOW', name: 'Followup' })
      .expect(201);
    const issue = await auth(http().post('/api/v1/projects/FOLLOW/issues'))
      .send({ summary: 'Attachment test' })
      .expect(201);
    issueKey = issue.body.key;
    await db.query(
      `CREATE TABLE "${schemaName}".github_links (issue_key text, link_type text, url text, title text, author text, created_at timestamptz, UNIQUE(issue_key, url))`,
    );
  }, 60_000);

  afterAll(async () => {
    if (!app) return;
    for (const key of storageKeys) await app.get(StorageService).delete(key);
    if (db) {
      await connections.closeAll();
      await db.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await db.query('DELETE FROM public.tenant_memberships WHERE tenant_id = $1', [tenantId]);
      await db.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
      await db.query("DELETE FROM public.users WHERE email = 'review-followup@example.com'");
    }
    await app.close();
  }, 30_000);

  it('runs the additive migration repeatedly against existing tenant tables', async () => {
    const tenantDb = await connections.getConnection(schemaName);
    await runReviewReliabilityMigration(tenantDb, schemaName);
    await runReviewReliabilityMigration(tenantDb, schemaName);
    const tables = await db.query(
      'SELECT tablename FROM pg_tables WHERE schemaname = $1 AND tablename IN ($2, $3)',
      [schemaName, 'attachment_cleanup', 'inbound_webhook_receipts'],
    );
    expect(tables).toHaveLength(2);
  });

  it('returns a controlled conflict for concurrent project creation', async () => {
    const results = await Promise.all(
      [1, 2].map(() =>
        auth(http().post('/api/v1/projects')).send({ key: 'RACE', name: 'Concurrent' }),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
  });

  it('rolls back a failed initial-status insert and serializes concurrent switches', async () =>
    inTenant(async () => {
      const service = app.get(WorkflowsService);
      const workflow = await service.create({ name: 'Atomic status', isDefault: false });
      const status = {
        name: 'First',
        category: 'todo' as const,
        color: '#ffffff',
        isInitial: true,
        isTerminal: false,
        position: 0,
      };
      const first = await service.addStatus(workflow.id, status);
      await expect(
        service.addStatus(workflow.id, { ...status, name: 'x'.repeat(101) }),
      ).rejects.toThrow();
      let rows = await db.query(
        `SELECT id FROM "${schemaName}".workflow_statuses WHERE workflow_id = $1 AND is_initial`,
        [workflow.id],
      );
      expect(rows).toEqual([{ id: first.id }]);
      await Promise.all(
        ['Second', 'Third'].map((name) => service.addStatus(workflow.id, { ...status, name })),
      );
      rows = await db.query(
        `SELECT id FROM "${schemaName}".workflow_statuses WHERE workflow_id = $1 AND is_initial`,
        [workflow.id],
      );
      expect(rows).toHaveLength(1);
    }));

  it('preserves attachment content on rollback and retries cleanup after storage failure', async () =>
    inTenant(async () => {
      const attachments = app.get(AttachmentsService);
      const storage = app.get(StorageService);
      const buffer = Buffer.from('recoverable attachment');
      const attachment = await attachments.create(
        issueKey,
        { buffer, size: buffer.length, originalname: 'test.txt', mimetype: 'text/plain' } as any,
        userId,
      );
      storageKeys.push(attachment.storageKey);
      await db.query(`CREATE FUNCTION "${schemaName}".fail_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected database failure'; END; $$;
      CREATE TRIGGER fail_delete BEFORE DELETE ON "${schemaName}".attachments FOR EACH ROW EXECUTE FUNCTION "${schemaName}".fail_delete()`);
      try {
        await expect(attachments.delete(attachment.id, issueKey)).rejects.toThrow(
          'injected database failure',
        );
        expect(await storage.get(attachment.storageKey)).toEqual(buffer);
        expect(await db.query(`SELECT * FROM "${schemaName}".attachment_cleanup`)).toHaveLength(0);
        expect((await attachments.findById(attachment.id)).id).toBe(attachment.id);
      } finally {
        await db.query(`DROP TRIGGER fail_delete ON "${schemaName}".attachments`);
      }
      await attachments.delete(attachment.id, issueKey);
      await expect(attachments.findById(attachment.id)).rejects.toThrow();
      expect(await storage.get(attachment.storageKey)).toEqual(buffer);
      const cleanup = app.get(AttachmentCleanupService);
      const fail = jest
        .spyOn(storage, 'delete')
        .mockRejectedValueOnce(new Error('storage unavailable'));
      try {
        await expect(cleanup.drainTenant()).rejects.toThrow('storage unavailable');
      } finally {
        fail.mockRestore();
      }
      expect(await db.query(`SELECT * FROM "${schemaName}".attachment_cleanup`)).toHaveLength(1);
      await cleanup.drainTenant();
      await expect(storage.get(attachment.storageKey)).rejects.toThrow();
      expect(await db.query(`SELECT * FROM "${schemaName}".attachment_cleanup`)).toHaveLength(0);
    }));

  it('deduplicates concurrent signed webhooks and persists the receipt', async () =>
    inTenant(async () => {
      const secret = 'synthetic-provider-secret';
      const payload = JSON.stringify({
        ref: 'refs/heads/main',
        commits: [{ message: 'FOLLOW-1 linked', url: 'https://example.com/commit' }],
      });
      const req = {
        rawBody: payload,
        body: JSON.parse(payload),
        headers: {
          'x-github-event': 'push',
          'x-hub-signature-256':
            'sha256=' + createHmac('sha256', secret).update(payload).digest('hex'),
        },
      };
      const factory = app.get(PluginContextFactory);
      const emit = jest.spyOn(app.get(EventDispatcherService), 'emit');
      try {
        const contexts = await Promise.all(
          [1, 2].map(() => factory.create('@weaver/plugin-github', { webhookSecret: secret })),
        );
        await Promise.all(contexts.map((context) => handleGitHubWebhook(req, context)));
        // One deferred call inside the transaction and one dispatch after COMMIT.
        expect(emit.mock.calls.filter(([event]) => event === 'github.push_received')).toHaveLength(
          2,
        );
        await handleGitHubWebhook(
          req,
          await factory.create('@weaver/plugin-github', { webhookSecret: secret }),
        );
        expect(emit.mock.calls.filter(([event]) => event === 'github.push_received')).toHaveLength(
          2,
        );
        expect(await db.query(`SELECT * FROM "${schemaName}".github_links`)).toHaveLength(1);
        expect(
          await db.query(`SELECT * FROM "${schemaName}".inbound_webhook_receipts`),
        ).toHaveLength(1);
      } finally {
        emit.mockRestore();
      }
    }));

  it('rolls back failed processing, allows retry, and separates plugin receipt namespaces', async () =>
    inTenant(async () => {
      const service = app.get(InboundWebhookService);
      const digest = createHash('sha256').update('retry-test').digest('hex');
      await expect(
        service.processOnce('test-plugin', digest, async () => {
          const manager = await connections.getEntityManager();
          await manager.query(
            "INSERT INTO github_links (issue_key, url) VALUES ('FOLLOW-1', 'https://example.com/rollback')",
          );
          throw new Error('processing failed');
        }),
      ).rejects.toThrow('processing failed');
      expect(
        await db.query(
          `SELECT * FROM "${schemaName}".github_links WHERE url = 'https://example.com/rollback'`,
        ),
      ).toHaveLength(0);
      expect(await service.processOnce('test-plugin', digest, async () => undefined)).toBe(true);
      expect(await service.processOnce('test-plugin', digest, async () => undefined)).toBe(false);
      expect(await service.processOnce('another-plugin', digest, async () => undefined)).toBe(true);
    }));

  it('rejects malformed rich text at the HTTP boundary and still accepts ordinary documents', async () => {
    const json = '{"body":' + '{"content":['.repeat(5000) + '{}' + ']}'.repeat(5000) + '}';
    await auth(http().post(`/api/v1/issues/${issueKey}/comments`))
      .set('Content-Type', 'application/json')
      .send(json)
      .expect(400);
    await auth(http().post(`/api/v1/issues/${issueKey}/comments`))
      .send({
        body: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Normal comment' }] }],
        },
      })
      .expect(201);
  });
});
