import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { TenantConnectionProvider } from '../src/core/tenant';

describe('Automatic Time Phase 6 review workflow (e2e)', () => {
  jest.setTimeout(30_000);

  const pluginId = '@weaver/plugin-automatic-time';
  const pluginRouteId = '@weaver~plugin-automatic-time';
  const email = 'automatic-time-review-e2e@example.com';
  const memberEmail = 'automatic-time-review-member-e2e@example.com';
  const tenantSlug = 'automatic-time-review-e2e';
  const schemaName = 'tenant_automatic_time_review_e2e';
  const localDate = '2026-08-30';

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
    await app.listen(0, '127.0.0.1');

    dataSource = app.get(DataSource);
    connections = app.get(TenantConnectionProvider);
    await cleanupTestData();

    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email,
        password: 'password123',
        displayName: 'Automatic Time Review Tester',
        orgName: 'Automatic Time Review E2E',
        orgSlug: tenantSlug,
      })
      .expect(201);

    accessToken = registration.body.accessToken;
    tenantId = registration.body.tenantId;
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
    await dataSource.query('DELETE FROM public.users WHERE email = ANY($1::text[])', [
      [email, memberEmail],
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
  });

  it('previews, releases, reopens, and protects a partially locked day', async () => {
    const project = await authedRequest()
      .post('/api/v1/projects')
      .send({ name: 'Automatic Time Review', key: 'ATR' })
      .expect(201);
    const issue = await authedRequest()
      .post(`/api/v1/projects/${project.body.key}/issues`)
      .send({ summary: 'Complete daily review', assigneeId: userId })
      .expect(201);

    await authedRequest().post('/api/v1/plugins/install').send({ pluginId }).expect(201);
    await authedRequest().post('/api/v1/plugins/enable').send({ pluginId }).expect(201);

    await authedRequest()
      .get(`/api/v1/plugin-routes/${pluginRouteId}/timeline-status`)
      .expect(200)
      .expect((response) => expect(response.body.state).toBe('unpaired'));
    await dataSource.query(
      `INSERT INTO "${schemaName}".automatic_time_devices (
         user_id, display_name, platform, companion_version, token_hash, scopes,
         last_seen_at, expires_at
       ) VALUES ($1::uuid, 'Synthetic Mac', 'macos', '0.3.0', $2, '[]'::jsonb, now(), now() + interval '1 day')`,
      [userId, 'phase-6-synthetic-device-token-hash'],
    );
    await authedRequest()
      .get(`/api/v1/plugin-routes/${pluginRouteId}/timeline-status`)
      .expect(200)
      .expect((response) => expect(response.body.state).toBe('active'));
    await dataSource.query(
      `UPDATE "${schemaName}".automatic_time_devices SET last_seen_at = now() - interval '5 minutes'`,
    );
    await authedRequest()
      .get(`/api/v1/plugin-routes/${pluginRouteId}/timeline-status`)
      .expect(200)
      .expect((response) => expect(response.body.state).toBe('stale'));
    await dataSource.query(
      `UPDATE "${schemaName}".automatic_time_devices SET last_seen_at = now() - interval '20 minutes'`,
    );
    await authedRequest()
      .get(`/api/v1/plugin-routes/${pluginRouteId}/timeline-status`)
      .expect(200)
      .expect((response) => expect(response.body.state).toBe('offline'));

    const fixtures = await authedRequest()
      .post(`/api/v1/plugin-routes/${pluginRouteId}/test/fixtures/drafts`)
      .send({
        drafts: [
          {
            sourceReference: 'phase-6-captured-1',
            localDate,
            startedAt: '2026-08-30T13:00:00.000Z',
            endedAt: '2026-08-30T13:30:00.000Z',
            proposedMinutes: 30,
            description: 'Synthetic captured block one',
            confidence: 0.84,
            assignmentMethod: 'synthetic-fixture',
            assignmentReasons: ['Recent Weaver issue activity'],
            evidenceDigest: 'sha256:phase-6-captured-1',
          },
          {
            sourceReference: 'phase-6-captured-2',
            localDate,
            startedAt: '2026-08-30T13:30:00.000Z',
            endedAt: '2026-08-30T14:00:00.000Z',
            proposedMinutes: 30,
            description: 'Synthetic captured block two',
            confidence: 0.78,
            assignmentMethod: 'synthetic-fixture',
            assignmentReasons: ['Repository mapping matched'],
            evidenceDigest: 'sha256:phase-6-captured-2',
          },
        ],
      })
      .expect(201);

    for (const draft of fixtures.body) {
      await authedRequest()
        .post(`/api/v1/plugin-routes/${pluginRouteId}/drafts/${draft.id}/assign`)
        .send({ issueKey: issue.body.key })
        .expect(200);
    }

    const editedInterval = await authedRequest()
      .patch(`/api/v1/plugin-routes/${pluginRouteId}/drafts/${fixtures.body[1].id}`)
      .send({
        startedAt: '2026-08-30T13:30:00.000Z',
        endedAt: '2026-08-30T14:05:00.000Z',
      })
      .expect(200);
    expect(new Date(editedInterval.body.endedAt).toISOString()).toBe('2026-08-30T14:05:00.000Z');

    const split = await authedRequest()
      .post(`/api/v1/plugin-routes/${pluginRouteId}/drafts/${fixtures.body[0].id}/split`)
      .send({ splitAt: '2026-08-30T13:15:00.000Z' })
      .expect(201);
    expect(split.body.map((draft: { proposedMinutes: number }) => draft.proposedMinutes)).toEqual([
      15, 15,
    ]);

    const merged = await authedRequest()
      .post(`/api/v1/plugin-routes/${pluginRouteId}/drafts/merge`)
      .send({ draftIds: split.body.map((draft: { id: string }) => draft.id) })
      .expect(201);
    expect(merged.body).toEqual(
      expect.objectContaining({ proposedMinutes: 30, issueKey: issue.body.key }),
    );

    await authedRequest()
      .post(`/api/v1/plugin-routes/${pluginRouteId}/drafts/offline`)
      .send({
        localDate,
        startedAt: '2026-08-30T15:00:00.000Z',
        endedAt: '2026-08-30T15:15:00.000Z',
        proposedMinutes: 15,
        description: 'Synthetic offline planning',
        issueKey: issue.body.key,
      })
      .expect(201);

    const preview = await authedRequest()
      .post(`/api/v1/plugin-routes/${pluginRouteId}/review/${localDate}/preview`)
      .send({ reportedTotalMinutes: 80 })
      .expect(200);
    expect(preview.body).toEqual(
      expect.objectContaining({
        capturedTotalMinutes: 75,
        hiddenTotalMinutes: 0,
        reportedTotalMinutes: 80,
        manualAdjustmentMinutes: 5,
      }),
    );
    expect(
      preview.body.entries.reduce(
        (total: number, entry: { minutes: number }) => total + entry.minutes,
        0,
      ),
    ).toBe(80);

    const releaseBody = {
      idempotencyKey: 'phase-6-review-release-v1',
      reportedTotalMinutes: 80,
    };
    const firstRelease = await authedRequest()
      .post(`/api/v1/plugin-routes/${pluginRouteId}/review/${localDate}/release`)
      .send(releaseBody)
      .expect(200);
    expect(firstRelease.body.created).toBe(3);
    expect(firstRelease.body.batch.reportedTotalMinutes).toBe(80);

    const reopened = await authedRequest()
      .post(`/api/v1/plugin-routes/${pluginRouteId}/review/${localDate}/reopen`)
      .expect(200);
    expect(reopened.body).toEqual(
      expect.objectContaining({ status: 'reopened', reopenedDraftCount: 3 }),
    );
    expect(
      await dataSource.query(`SELECT id FROM "${schemaName}".time_entries ORDER BY id`),
    ).toHaveLength(0);

    const secondRelease = await authedRequest()
      .post(`/api/v1/plugin-routes/${pluginRouteId}/review/${localDate}/release`)
      .send(releaseBody)
      .expect(200);
    expect(secondRelease.body.created).toBe(3);

    await dataSource.query(
      `UPDATE "${schemaName}".automatic_time_release_batches
          SET status = 'reopening'
        WHERE user_id = $1::uuid AND local_date = $2::date`,
      [userId, localDate],
    );
    await dataSource.query(`DELETE FROM "${schemaName}".time_entries WHERE id = ANY($1::uuid[])`, [
      secondRelease.body.entries.map((entry: { id: string }) => entry.id),
    ]);
    const interruptedReview = await authedRequest()
      .get(`/api/v1/plugin-routes/${pluginRouteId}/review/${localDate}`)
      .expect(200);
    expect(interruptedReview.body).toEqual(
      expect.objectContaining({ releaseStatus: 'reopening', canReopen: true }),
    );
    const resumedReopen = await authedRequest()
      .post(`/api/v1/plugin-routes/${pluginRouteId}/review/${localDate}/reopen`)
      .expect(200);
    expect(resumedReopen.body).toEqual(
      expect.objectContaining({ status: 'reopened', reopenedDraftCount: 3 }),
    );
    await authedRequest()
      .post(`/api/v1/plugin-routes/${pluginRouteId}/review/${localDate}/reopen`)
      .expect(200);

    const thirdRelease = await authedRequest()
      .post(`/api/v1/plugin-routes/${pluginRouteId}/review/${localDate}/release`)
      .send(releaseBody)
      .expect(200);
    expect(thirdRelease.body.created).toBe(3);

    await dataSource.query(
      `UPDATE "${schemaName}".time_entries
          SET locked_at = now(), lock_reason = 'Synthetic invoicing lock'
        WHERE id = $1::uuid`,
      [thirdRelease.body.entries[0].id],
    );

    const blockedReopen = await authedRequest()
      .post(`/api/v1/plugin-routes/${pluginRouteId}/review/${localDate}/reopen`)
      .expect(409);
    expect(blockedReopen.body).toEqual(
      expect.objectContaining({
        status: 'partially_locked',
        lockedEntryCount: 1,
        officialEntryCount: 3,
      }),
    );
    expect(
      await dataSource.query(`SELECT id FROM "${schemaName}".time_entries ORDER BY id`),
    ).toHaveLength(3);
  });

  it('rejects a private issue key in drafts without revealing that it exists', async () => {
    await authedRequest()
      .post('/api/v1/plugins/install')
      .send({ pluginId })
      .expect((response) => expect([201, 409]).toContain(response.status));
    await authedRequest().post('/api/v1/plugins/enable').send({ pluginId }).expect(201);
    await authedRequest()
      .post('/api/v1/projects')
      .send({ name: 'Automatic Time Hidden', key: 'ATH' })
      .expect(201);
    const hiddenIssue = await authedRequest()
      .post('/api/v1/projects/ATH/issues')
      .send({ summary: 'Private work the member cannot see' })
      .expect(201);

    const [member] = await dataSource.query(
      `INSERT INTO public.users
         (id, email, display_name, password_hash, auth_provider, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'Automatic Time Member', $2, 'local', NOW(), NOW())
       RETURNING id`,
      [memberEmail, await bcrypt.hash('password123', 10)],
    );
    await dataSource.query(
      `INSERT INTO public.tenant_memberships (tenant_id, user_id, role, created_at)
       VALUES ($1, $2, 'member', NOW())`,
      [tenantId, member.id],
    );
    await dataSource.query(
      `UPDATE "${schemaName}".roles SET permissions = permissions || $1::jsonb WHERE name = 'member'`,
      [JSON.stringify({ 'automatic-time.view': true, 'automatic-time.manage-drafts': true })],
    );
    const memberToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: memberEmail, password: 'password123' })
        .expect(201)
    ).body.accessToken;
    const memberPost = (path: string) =>
      request(app.getHttpServer())
        .post(`/api/v1/plugin-routes/${pluginRouteId}${path}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .set('X-Tenant-ID', tenantId);

    const offlineDraft = (issueKey: string) =>
      memberPost('/drafts/offline').send({
        localDate,
        startedAt: '2026-08-30T16:00:00.000Z',
        endedAt: '2026-08-30T16:15:00.000Z',
        proposedMinutes: 15,
        description: 'Synthetic member offline work',
        issueKey,
      });
    const hiddenOffline = await offlineDraft(hiddenIssue.body.key).expect(404);
    const missingOffline = await offlineDraft('ATH-9999').expect(404);
    expect(hiddenOffline.body).toEqual(missingOffline.body);

    const [draft] = (
      await memberPost('/test/fixtures/drafts')
        .send({
          drafts: [
            {
              sourceReference: 'phase-6-member-captured',
              localDate,
              startedAt: '2026-08-30T16:30:00.000Z',
              endedAt: '2026-08-30T17:00:00.000Z',
              proposedMinutes: 30,
              description: 'Synthetic member captured block',
              confidence: 0.5,
              assignmentMethod: 'synthetic-fixture',
              assignmentReasons: ['Synthetic member fixture'],
              evidenceDigest: 'sha256:phase-6-member-captured',
            },
          ],
        })
        .expect(201)
    ).body;
    const hiddenAssign = await memberPost(`/drafts/${draft.id}/assign`)
      .send({ issueKey: hiddenIssue.body.key })
      .expect(404);
    const missingAssign = await memberPost(`/drafts/${draft.id}/assign`)
      .send({ issueKey: 'ATH-9999' })
      .expect(404);
    expect(hiddenAssign.body).toEqual(missingAssign.body);

    const memberDrafts = await dataSource.query(
      `SELECT issue_key FROM "${schemaName}".automatic_time_drafts WHERE user_id = $1::uuid`,
      [member.id],
    );
    expect(memberDrafts).toEqual([{ issue_key: null }]);
  });
});
