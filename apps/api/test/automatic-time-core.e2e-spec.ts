import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { InstalledPluginEntity } from '@weaver/db';
import { AppModule } from '../src/app.module';
import { TenantConnectionProvider, tenantStorage } from '../src/core/tenant';
import { PluginContextFactory } from '../src/plugins/plugin-context.factory';
import { PluginLoaderService } from '../src/plugins/plugin-loader.service';

describe('Automatic Time Phase 1 core boundary (e2e)', () => {
  jest.setTimeout(30_000);
  const pluginId = '@weaver/plugin-automatic-time-test';
  const email = 'automatic-time-core-e2e@example.com';
  const tenantSlug = 'automatic-time-core-e2e';
  const schemaName = 'tenant_automatic_time_core_e2e';

  let app: INestApplication;
  let dataSource: DataSource;
  let connections: TenantConnectionProvider;
  let contextFactory: PluginContextFactory;
  let loader: PluginLoaderService;
  let pluginDirectory: string;
  let accessToken: string;
  let tenantId: string;
  let userId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    dataSource = app.get(DataSource);
    connections = app.get(TenantConnectionProvider);
    contextFactory = app.get(PluginContextFactory);
    loader = app.get(PluginLoaderService);
    await cleanupTestData();

    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email,
        password: 'password123',
        displayName: 'Automatic Time Tester',
        orgName: 'Automatic Time Core E2E',
        orgSlug: tenantSlug,
      })
      .expect(201);

    accessToken = registration.body.accessToken;
    tenantId = registration.body.tenantId;
    userId = registration.body.user.id;

    pluginDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'weaver-automatic-time-e2e-'));
    const manifestDirectory = path.join(pluginDirectory, 'automatic-time-test');
    fs.mkdirSync(manifestDirectory);
    fs.writeFileSync(
      path.join(manifestDirectory, 'weaver-plugin.json'),
      JSON.stringify({
        id: pluginId,
        name: 'Automatic Time Test',
        version: '0.1.0',
        type: 'app',
        scope: 'tenant',
        entrypoints: {},
        permissions: [],
        requires: {
          coreCapabilities: ['issue-candidates', 'time-entries'],
        },
      }),
    );
    await loader.loadPlugins(pluginDirectory);

    await dataSource.getRepository(InstalledPluginEntity).save({
      tenantId,
      pluginId,
      version: '0.1.0',
      enabled: true,
      settings: {},
    });
  });

  afterAll(async () => {
    if (connections) {
      await connections.closeAll();
    }
    if (dataSource?.isInitialized) {
      await cleanupTestData();
    }
    if (pluginDirectory) {
      fs.rmSync(pluginDirectory, { recursive: true, force: true });
    }
    if (app) {
      await app.close();
    }
  });

  async function cleanupTestData(): Promise<void> {
    await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await dataSource.query(
      `DELETE FROM public.installed_plugins
        WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug = $1)`,
      [tenantSlug],
    );
    await dataSource.query(
      `DELETE FROM public.tenant_memberships
        WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug = $1)`,
      [tenantSlug],
    );
    await dataSource.query('DELETE FROM public.tenants WHERE slug = $1', [tenantSlug]);
    await dataSource.query('DELETE FROM public.users WHERE email = $1', [email]);
  }

  const authedRequest = () => ({
    get: (url: string) =>
      request(app.getHttpServer())
        .get(url)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Tenant-ID', tenantId),
    post: (url: string) =>
      request(app.getHttpServer())
        .post(url)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Tenant-ID', tenantId),
    patch: (url: string) =>
      request(app.getHttpServer())
        .patch(url)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Tenant-ID', tenantId),
    delete: (url: string) =>
      request(app.getHttpServer())
        .delete(url)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Tenant-ID', tenantId),
  });

  it('creates one official entry through the capability API, remains idempotent, and enforces disable and lock boundaries', async () => {
    const project = await authedRequest()
      .post('/api/v1/projects')
      .send({ name: 'Automatic Time', key: 'ATM' })
      .expect(201);
    const issue = await authedRequest()
      .post(`/api/v1/projects/${project.body.key}/issues`)
      .send({ summary: 'Build automatic time', assigneeId: userId })
      .expect(201);

    const requestBody = {
      entries: [
        {
          issueKey: issue.body.key,
          sourceReference: 'draft-1',
          minutes: 45,
          description: 'Synthetic automatic-time draft',
          startedAt: '2026-08-29T13:00:00Z',
          endedAt: '2026-08-29T13:45:00Z',
        },
      ],
    };

    const result = await tenantStorage.run({ tenantId, schemaName }, async () => {
      const context = await contextFactory.create(
        pluginId,
        {},
        { id: userId, email, displayName: 'Automatic Time Tester' },
      );
      const candidates = await context.api.issues.findCandidates({
        issueKeys: [issue.body.key],
      });
      expect(candidates).toEqual([
        expect.objectContaining({ key: issue.body.key, projectKey: 'ATM' }),
      ]);

      const first = await context.api.timeEntries.createBatch(requestBody);
      const retry = await context.api.timeEntries.createBatch(requestBody);
      return { first, retry, context };
    });

    expect(result.first.created).toBe(1);
    expect(result.retry.created).toBe(0);
    expect(result.retry.entries[0].id).toBe(result.first.entries[0].id);

    const entries = await authedRequest()
      .get(`/api/v1/issues/${issue.body.key}/time-entries`)
      .expect(200);
    expect(entries.body).toHaveLength(1);
    expect(entries.body[0]).toEqual(
      expect.objectContaining({
        id: result.first.entries[0].id,
        source: 'plugin',
        sourcePluginId: pluginId,
        sourceReference: 'draft-1',
      }),
    );

    await dataSource
      .getRepository(InstalledPluginEntity)
      .update({ tenantId, pluginId }, { enabled: false });
    await expect(
      tenantStorage.run({ tenantId, schemaName }, () =>
        result.context.api.timeEntries.createBatch({
          entries: [{ issueKey: issue.body.key, sourceReference: 'draft-2', minutes: 15 }],
        }),
      ),
    ).rejects.toThrow('is not installed and enabled');

    await dataSource.query(
      `UPDATE "${schemaName}"."time_entries"
          SET locked_at = NOW(), lock_reason = 'Synthetic billing lock'
        WHERE id = $1`,
      [result.first.entries[0].id],
    );
    await authedRequest()
      .patch(`/api/v1/issues/${issue.body.key}/time-entries/${result.first.entries[0].id}`)
      .send({ minutes: 60 })
      .expect(409);
    await authedRequest()
      .delete(`/api/v1/issues/${issue.body.key}/time-entries/${result.first.entries[0].id}`)
      .expect(409);
  });
});
