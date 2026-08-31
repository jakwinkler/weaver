import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TenantConnectionProvider } from '../src/core/tenant';

describe('Automatic Time Phase 7 learning and local metrics (e2e)', () => {
  jest.setTimeout(30_000);

  const pluginId = '@weaver/plugin-automatic-time';
  const pluginRouteId = '@weaver~plugin-automatic-time';
  const email = 'automatic-time-learning-e2e@example.com';
  const tenantSlug = 'automatic-time-learning-e2e';
  const schemaName = 'tenant_automatic_time_learning_e2e';
  const localDate = '2026-08-31';
  const correctionContextDigest = `sha256:${'a'.repeat(64)}`;

  let app: INestApplication;
  let dataSource: DataSource;
  let connections: TenantConnectionProvider;
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
    await cleanupTestData();

    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email,
        password: 'password123',
        displayName: 'Automatic Time Learning Tester',
        orgName: 'Automatic Time Learning E2E',
        orgSlug: tenantSlug,
      })
      .expect(201);
    accessToken = registration.body.accessToken;
    tenantId = registration.body.tenant.id;
    userId = registration.body.user.id;
  });

  afterAll(async () => {
    if (connections) await connections.closeAll();
    if (dataSource?.isInitialized) await cleanupTestData();
    if (app) await app.close();
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
  const pluginRoute = (path: string) => `/api/v1/plugin-routes/${pluginRouteId}${path}`;

  it('learns reversible private memories and exposes local alpha metrics', async () => {
    const project = await authedRequest()
      .post('/api/v1/projects')
      .send({ name: 'Automatic Time Learning', key: 'ATL' })
      .expect(201);
    const firstIssue = await authedRequest()
      .post(`/api/v1/projects/${project.body.key}/issues`)
      .send({ summary: 'Original private suggestion', assigneeId: userId })
      .expect(201);
    const correctedIssue = await authedRequest()
      .post(`/api/v1/projects/${project.body.key}/issues`)
      .send({ summary: 'Confirmed private correction', assigneeId: userId })
      .expect(201);

    await authedRequest().post('/api/v1/plugins/install').send({ pluginId }).expect(201);
    await authedRequest().post('/api/v1/plugins/enable').send({ pluginId }).expect(201);

    const inserted = await dataSource.query(
      `INSERT INTO "${schemaName}".automatic_time_drafts (
         user_id, source_reference, local_date, started_at, ended_at,
         proposed_minutes, description, issue_id, issue_key, suggested_issue_key,
         confidence, assignment_method, assignment_reasons, assignment_alternatives,
         ruleset_version, evidence_digest, correction_context_digest
       ) VALUES (
         $1::uuid, 'phase-7-learning-draft', $2::date,
         '2026-08-31T13:00:00Z', '2026-08-31T13:30:00Z', 30,
         'Synthetic private correction', $3::uuid, $4, $4, 0.82,
         'deterministic', '["Synthetic repository evidence"]'::jsonb,
         '[]'::jsonb, 'automatic-time-assignment-v1', $5, $6
       ) RETURNING *`,
      [
        userId,
        localDate,
        firstIssue.body.id,
        firstIssue.body.key,
        'sha256:synthetic-evidence',
        correctionContextDigest,
      ],
    );

    await authedRequest()
      .post(pluginRoute(`/drafts/${inserted[0].id}/assign`))
      .send({ issueKey: correctedIssue.body.key })
      .expect(200);

    const memories = await authedRequest().get(pluginRoute('/correction-memories')).expect(200);
    expect(memories.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetIssueKey: correctedIssue.body.key,
          positiveCount: 1,
          negativeCount: 0,
          enabled: true,
          normalizedFeatures: { contextDigest: correctionContextDigest },
        }),
        expect.objectContaining({
          targetIssueKey: firstIssue.body.key,
          positiveCount: 0,
          negativeCount: 1,
          enabled: true,
        }),
      ]),
    );
    const positive = memories.body.find(
      (memory: { targetIssueKey: string }) => memory.targetIssueKey === correctedIssue.body.key,
    );
    const negative = memories.body.find(
      (memory: { targetIssueKey: string }) => memory.targetIssueKey === firstIssue.body.key,
    );

    const disabled = await authedRequest()
      .patch(pluginRoute(`/correction-memories/${positive.id}`))
      .send({ enabled: false })
      .expect(200);
    expect(disabled.body).toEqual(
      expect.objectContaining({ enabled: false, recomputeRevision: 1, affectedDraftCount: 1 }),
    );
    const recomputed = await authedRequest()
      .post(pluginRoute(`/correction-memories/${negative.id}/recompute`))
      .expect(200);
    expect(recomputed.body).toEqual(
      expect.objectContaining({ recomputeRevision: 2, affectedDraftCount: 1 }),
    );
    await authedRequest()
      .delete(pluginRoute(`/correction-memories/${negative.id}`))
      .expect(204);

    await authedRequest()
      .get(pluginRoute(`/review/${localDate}`))
      .expect(200);
    await dataSource.query(
      `UPDATE "${schemaName}".automatic_time_review_sessions
          SET opened_at = now() - interval '90 seconds'
        WHERE user_id = $1::uuid AND local_date = $2::date`,
      [userId, localDate],
    );
    await authedRequest()
      .post(pluginRoute(`/review/${localDate}/release`))
      .send({ idempotencyKey: 'phase-7-learning-release' })
      .expect(200);

    await authedRequest()
      .post(`/api/v1/issues/${correctedIssue.body.key}/time-entries`)
      .send({ minutes: 5, description: 'Exceptional manual timer', source: 'timer' })
      .expect(201);

    const metrics = await authedRequest().get(pluginRoute('/local-alpha/metrics')).expect(200);
    expect(metrics.body).toEqual(
      expect.objectContaining({
        capturedMinutes: 30,
        releasedDraftCount: 1,
        acceptedSuggestionCount: 0,
        reassignedDraftCount: 1,
        unmatchedDraftCount: 0,
        destinationAccuracy: 0,
        correctionRate: 1,
        manualTimerEntryCount: 1,
        workingDayCount: 1,
        alphaComplete: false,
      }),
    );
    expect(metrics.body.medianReviewSeconds).toBeGreaterThanOrEqual(89);
    expect(metrics.body.medianReviewSeconds).toBeLessThanOrEqual(92);
  });
});
