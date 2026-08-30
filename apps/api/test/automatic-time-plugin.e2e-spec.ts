import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TenantConnectionProvider } from '../src/core/tenant';

describe('Automatic Time Phase 2 plugin (e2e)', () => {
  jest.setTimeout(30_000);

  const pluginId = '@weaver/plugin-automatic-time';
  const timeReportsPluginId = '@weaver/plugin-time-reports';
  const pluginRouteId = '@weaver~plugin-automatic-time';
  const timeReportsRouteId = '@weaver~plugin-time-reports';
  const email = 'automatic-time-plugin-e2e@example.com';
  const otherEmail = 'automatic-time-plugin-other-e2e@example.com';
  const tenantSlug = 'automatic-time-plugin-e2e';
  const otherTenantSlug = 'automatic-time-plugin-other-e2e';
  const schemaName = 'tenant_automatic_time_plugin_e2e';
  const otherSchemaName = 'tenant_automatic_time_plugin_other_e2e';
  const localDate = '2026-08-29';

  let app: INestApplication;
  let dataSource: DataSource;
  let connections: TenantConnectionProvider;
  let accessToken: string;
  let tenantId: string;
  let userId: string;

  beforeAll(async () => {
    process.env.WEAVER_AUTOMATIC_TIME_FIXTURES = 'enabled';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    dataSource = app.get(DataSource);
    connections = app.get(TenantConnectionProvider);
    await cleanupTestData();

    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email,
        password: 'password123',
        displayName: 'Automatic Time Plugin Tester',
        orgName: 'Automatic Time Plugin E2E',
        orgSlug: tenantSlug,
      })
      .expect(201);

    accessToken = registration.body.accessToken;
    tenantId = registration.body.tenant.id;
    userId = registration.body.user.id;
  });

  afterAll(async () => {
    if (connections) {
      await connections.closeAll();
    }
    if (dataSource?.isInitialized) {
      await cleanupTestData();
    }
    if (app) {
      await app.close();
    }
  });

  async function cleanupTestData(): Promise<void> {
    await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await dataSource.query(`DROP SCHEMA IF EXISTS "${otherSchemaName}" CASCADE`);
    await dataSource.query(
      `DELETE FROM public.installed_plugins
        WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug = ANY($1::text[]))`,
      [[tenantSlug, otherTenantSlug]],
    );
    await dataSource.query(
      `DELETE FROM public.tenant_memberships
        WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug = ANY($1::text[]))`,
      [[tenantSlug, otherTenantSlug]],
    );
    await dataSource.query('DELETE FROM public.tenants WHERE slug = ANY($1::text[])', [
      [tenantSlug, otherTenantSlug],
    ]);
    await dataSource.query('DELETE FROM public.users WHERE email = ANY($1::text[])', [
      [email, otherEmail],
    ]);
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

  it('reviews a synthetic private draft and releases exactly one official entry', async () => {
    const project = await authedRequest()
      .post('/api/v1/projects')
      .send({ name: 'Automatic Time', key: 'ATP' })
      .expect(201);
    const issue = await authedRequest()
      .post(`/api/v1/projects/${project.body.key}/issues`)
      .send({ summary: 'Review automatic time', assigneeId: userId })
      .expect(201);

    const installation = await authedRequest()
      .post('/api/v1/plugins/install')
      .send({ pluginId })
      .expect(201);
    expect(installation.body.enabled).toBe(false);

    await authedRequest().post('/api/v1/plugins/enable').send({ pluginId }).expect(201);
    await authedRequest()
      .post('/api/v1/plugins/install')
      .send({ pluginId: timeReportsPluginId })
      .expect(201);

    const fixtures = await authedRequest()
      .post(`/api/v1/plugin-routes/${pluginRouteId}/test/fixtures/drafts`)
      .send({
        drafts: [
          {
            sourceReference: 'synthetic-review-draft',
            localDate,
            startedAt: '2026-08-29T13:00:00.000Z',
            endedAt: '2026-08-29T13:45:00.000Z',
            proposedMinutes: 45,
            description: 'Synthetic automatic-time draft',
            confidence: 0.82,
            assignmentMethod: 'synthetic-fixture',
            assignmentReasons: ['Fixture evidence overlaps recent issue activity'],
            evidenceDigest: 'sha256:synthetic-review-draft',
          },
          {
            sourceReference: 'synthetic-hidden-draft',
            localDate,
            startedAt: '2026-08-29T14:00:00.000Z',
            endedAt: '2026-08-29T14:10:00.000Z',
            proposedMinutes: 10,
            description: 'Synthetic draft to hide',
            confidence: 0.1,
            assignmentMethod: 'synthetic-fixture',
            assignmentReasons: ['No matching issue'],
            evidenceDigest: 'sha256:synthetic-hidden-draft',
          },
          {
            sourceReference: 'synthetic-deleted-draft',
            localDate,
            startedAt: '2026-08-29T14:15:00.000Z',
            endedAt: '2026-08-29T14:20:00.000Z',
            proposedMinutes: 5,
            description: 'Synthetic draft to delete',
            confidence: 0,
            assignmentMethod: 'synthetic-fixture',
            assignmentReasons: [],
            evidenceDigest: 'sha256:synthetic-deleted-draft',
          },
        ],
      })
      .expect(201);
    expect(fixtures.body).toHaveLength(3);

    const otherRegistration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: otherEmail,
        password: 'password123',
        displayName: 'Other Automatic Time Tester',
        orgName: 'Other Automatic Time Plugin E2E',
        orgSlug: otherTenantSlug,
      })
      .expect(201);
    const otherUserRequest = () => ({
      get: (url: string) =>
        request(app.getHttpServer())
          .get(url)
          .set('Authorization', `Bearer ${otherRegistration.body.accessToken}`)
          .set('X-Tenant-ID', tenantId),
      patch: (url: string) =>
        request(app.getHttpServer())
          .patch(url)
          .set('Authorization', `Bearer ${otherRegistration.body.accessToken}`)
          .set('X-Tenant-ID', tenantId),
    });
    await otherUserRequest()
      .get(`/api/v1/plugin-routes/${pluginRouteId}/drafts?date=${localDate}`)
      .expect(200, []);

    const reviewDraft = fixtures.body.find(
      (draft: { sourceReference: string }) => draft.sourceReference === 'synthetic-review-draft',
    );
    const hiddenDraft = fixtures.body.find(
      (draft: { sourceReference: string }) => draft.sourceReference === 'synthetic-hidden-draft',
    );
    const deletedDraft = fixtures.body.find(
      (draft: { sourceReference: string }) => draft.sourceReference === 'synthetic-deleted-draft',
    );

    await otherUserRequest()
      .patch(`/api/v1/plugin-routes/${pluginRouteId}/drafts/${reviewDraft.id}`)
      .send({ proposedMinutes: 999 })
      .expect(404);

    await authedRequest()
      .patch(`/api/v1/plugin-routes/${pluginRouteId}/drafts/${reviewDraft.id}`)
      .send({ proposedMinutes: 50, description: 'Reviewed automatic-time draft' })
      .expect(200);
    await authedRequest()
      .post(`/api/v1/plugin-routes/${pluginRouteId}/drafts/${reviewDraft.id}/assign`)
      .send({ issueKey: issue.body.key })
      .expect(200);
    await authedRequest()
      .post(`/api/v1/plugin-routes/${pluginRouteId}/drafts/${hiddenDraft.id}/hide`)
      .expect(200);
    await authedRequest()
      .delete(`/api/v1/plugin-routes/${pluginRouteId}/drafts/${deletedDraft.id}`)
      .expect(204);

    const review = await authedRequest()
      .get(`/api/v1/plugin-routes/${pluginRouteId}/review/${localDate}`)
      .expect(200);
    expect(review.body).toEqual(
      expect.objectContaining({
        localDate,
        ready: true,
        releasableDraftCount: 1,
        hiddenDraftCount: 1,
        unresolvedDraftCount: 0,
        reportedTotalMinutes: 50,
      }),
    );

    const releaseBody = { idempotencyKey: 'release-2026-08-29-v1' };
    const firstRelease = await authedRequest()
      .post(`/api/v1/plugin-routes/${pluginRouteId}/review/${localDate}/release`)
      .send(releaseBody)
      .expect(200);
    const retryRelease = await authedRequest()
      .post(`/api/v1/plugin-routes/${pluginRouteId}/review/${localDate}/release`)
      .send(releaseBody)
      .expect(200);

    expect(firstRelease.body.created).toBe(1);
    expect(retryRelease.body.created).toBe(0);
    expect(retryRelease.body.entries[0].id).toBe(firstRelease.body.entries[0].id);

    const releasedReview = await authedRequest()
      .get(`/api/v1/plugin-routes/${pluginRouteId}/review/${localDate}`)
      .expect(200);
    expect(releasedReview.body).toEqual(
      expect.objectContaining({
        ready: false,
        releaseStatus: 'released',
        releasedDraftCount: 1,
        reportedTotalMinutes: 50,
      }),
    );

    const entries = await authedRequest()
      .get(`/api/v1/issues/${issue.body.key}/time-entries`)
      .expect(200);
    expect(entries.body).toHaveLength(1);
    expect(entries.body[0]).toEqual(
      expect.objectContaining({
        id: firstRelease.body.entries[0].id,
        minutes: 50,
        description: 'Reviewed automatic-time draft',
        source: 'plugin',
        sourcePluginId: pluginId,
        sourceReference: 'synthetic-review-draft',
      }),
    );

    const report = await authedRequest()
      .get(`/api/v1/plugin-routes/${timeReportsRouteId}/report?groupBy=issue`)
      .expect(200);
    expect(report.body.totals).toEqual({ totalMinutes: 50, totalEntries: 1 });
    expect(report.body.rows).toEqual([
      expect.objectContaining({ issue_key: issue.body.key, total_minutes: 50, entry_count: 1 }),
    ]);

    await authedRequest().post('/api/v1/plugins/disable').send({ pluginId }).expect(201);
    await authedRequest()
      .get(`/api/v1/plugin-routes/${pluginRouteId}/drafts?date=${localDate}`)
      .expect(503);

    const entriesWhileDisabled = await authedRequest()
      .get(`/api/v1/issues/${issue.body.key}/time-entries`)
      .expect(200);
    expect(entriesWhileDisabled.body).toHaveLength(1);

    await authedRequest().post('/api/v1/plugins/enable').send({ pluginId }).expect(201);
    await authedRequest().post('/api/v1/plugins/uninstall').send({ pluginId }).expect(400);
    await authedRequest()
      .post('/api/v1/plugins/uninstall')
      .send({ pluginId, confirmDataDeletion: true })
      .expect(204);

    const privateTables = await dataSource.query(
      `SELECT to_regclass($1) AS drafts,
              to_regclass($2) AS memories,
              to_regclass($3) AS batches,
              to_regclass($4) AS settings,
              to_regclass($5) AS devices`,
      [
        `${schemaName}.automatic_time_drafts`,
        `${schemaName}.automatic_time_correction_memories`,
        `${schemaName}.automatic_time_release_batches`,
        `${schemaName}.automatic_time_user_settings`,
        `${schemaName}.automatic_time_devices`,
      ],
    );
    expect(privateTables[0]).toEqual({
      drafts: null,
      memories: null,
      batches: null,
      settings: null,
      devices: null,
    });

    const entriesAfterUninstall = await authedRequest()
      .get(`/api/v1/issues/${issue.body.key}/time-entries`)
      .expect(200);
    expect(entriesAfterUninstall.body).toHaveLength(1);
  });
});
