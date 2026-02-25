import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { TenantConnectionProvider } from '../src/core/tenant';

describe('Drag & Drop / Reorder (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let connections: TenantConnectionProvider;

  let ownerToken: string;
  let viewerToken: string;
  let memberToken: string;
  let tenantId: string;

  let projectId: string;
  let issueKey1: string;
  let issueKey2: string;
  let issueKey3: string;
  let issueId1: string;
  let issueId2: string;
  let issueId3: string;
  let statuses: any[];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    dataSource = app.get(DataSource);
    connections = app.get(TenantConnectionProvider);

    // 1. Register owner
    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'dnd-owner@test.com',
        password: 'password123',
        displayName: 'DnD Owner',
        orgName: 'DnD Test Org',
        orgSlug: 'dnd-test-org',
      });

    ownerToken = registerRes.body.accessToken;
    tenantId = registerRes.body.tenant.id;

    // 2. Create viewer user
    const passwordHash = await bcrypt.hash('password123', 10);

    await dataSource.query(
      `INSERT INTO public.users (id, email, display_name, password_hash, auth_provider, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'local', NOW(), NOW())`,
      ['dnd-viewer@test.com', 'DnD Viewer', passwordHash],
    );
    const [viewerUser] = await dataSource.query(
      `SELECT id FROM public.users WHERE email = $1`,
      ['dnd-viewer@test.com'],
    );
    await dataSource.query(
      `INSERT INTO public.tenant_memberships (tenant_id, user_id, role, created_at)
       VALUES ($1, $2, 'viewer', NOW())`,
      [tenantId, viewerUser.id],
    );

    // 3. Create member user
    await dataSource.query(
      `INSERT INTO public.users (id, email, display_name, password_hash, auth_provider, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'local', NOW(), NOW())`,
      ['dnd-member@test.com', 'DnD Member', passwordHash],
    );
    const [memberUser] = await dataSource.query(
      `SELECT id FROM public.users WHERE email = $1`,
      ['dnd-member@test.com'],
    );
    await dataSource.query(
      `INSERT INTO public.tenant_memberships (tenant_id, user_id, role, created_at)
       VALUES ($1, $2, 'member', NOW())`,
      [tenantId, memberUser.id],
    );

    // 4. Login viewer & member
    const viewerLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'dnd-viewer@test.com', password: 'password123' });
    viewerToken = viewerLogin.body.accessToken;

    const memberLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'dnd-member@test.com', password: 'password123' });
    memberToken = memberLogin.body.accessToken;

    // 5. Create project
    const projectRes = await asOwner()
      .post('/api/v1/projects')
      .send({ name: 'DnD Project', key: 'DND' })
      .expect(201);
    projectId = projectRes.body.id;

    // 6. Get workflow statuses
    const workflowId = projectRes.body.workflowId;
    const workflowRes = await asOwner()
      .get(`/api/v1/workflows/${workflowId}`)
      .expect(200);
    statuses = workflowRes.body.statuses;

    // 7. Create 3 issues
    const issue1 = await asOwner()
      .post('/api/v1/projects/DND/issues')
      .send({ summary: 'Issue One' })
      .expect(201);
    issueKey1 = issue1.body.key;
    issueId1 = issue1.body.id;

    const issue2 = await asOwner()
      .post('/api/v1/projects/DND/issues')
      .send({ summary: 'Issue Two' })
      .expect(201);
    issueKey2 = issue2.body.key;
    issueId2 = issue2.body.id;

    const issue3 = await asOwner()
      .post('/api/v1/projects/DND/issues')
      .send({ summary: 'Issue Three' })
      .expect(201);
    issueKey3 = issue3.body.key;
    issueId3 = issue3.body.id;
  });

  afterAll(async () => {
    await dataSource.query(
      `DROP SCHEMA IF EXISTS "tenant_dnd_test_org" CASCADE`,
    );
    await dataSource.query(
      `DELETE FROM public.tenant_memberships WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug = 'dnd-test-org')`,
    );
    await dataSource.query(
      `DELETE FROM public.installed_plugins WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug = 'dnd-test-org')`,
    );
    await dataSource.query(
      `DELETE FROM public.tenants WHERE slug = 'dnd-test-org'`,
    );
    await dataSource.query(
      `DELETE FROM public.users WHERE email IN ('dnd-owner@test.com', 'dnd-viewer@test.com', 'dnd-member@test.com')`,
    );
    await connections.closeAll();
    await app.close();
  });

  // --- Helpers ---

  const authedRequestWith = (token: string, tid: string) => ({
    get: (url: string) =>
      request(app.getHttpServer())
        .get(url)
        .set('Authorization', `Bearer ${token}`)
        .set('X-Tenant-ID', tid),
    post: (url: string) =>
      request(app.getHttpServer())
        .post(url)
        .set('Authorization', `Bearer ${token}`)
        .set('X-Tenant-ID', tid),
    patch: (url: string) =>
      request(app.getHttpServer())
        .patch(url)
        .set('Authorization', `Bearer ${token}`)
        .set('X-Tenant-ID', tid),
    delete: (url: string) =>
      request(app.getHttpServer())
        .delete(url)
        .set('Authorization', `Bearer ${token}`)
        .set('X-Tenant-ID', tid),
  });

  function asOwner() {
    return authedRequestWith(ownerToken, tenantId);
  }
  function asViewer() {
    return authedRequestWith(viewerToken, tenantId);
  }
  function asMember() {
    return authedRequestWith(memberToken, tenantId);
  }

  // =========================================
  // Reorder Issues
  // =========================================
  describe('Reorder Issues', () => {
    it('PATCH /issues/reorder — updates sortOrder for multiple issues', async () => {
      await asOwner()
        .patch('/api/v1/issues/reorder')
        .send({
          issues: [
            { id: issueId1, sortOrder: 3000 },
            { id: issueId2, sortOrder: 1000 },
            { id: issueId3, sortOrder: 2000 },
          ],
        })
        .expect(204);

      // Verify order
      const res = await asOwner()
        .get('/api/v1/projects/DND/issues?sort=sortOrder')
        .expect(200);

      const keys = res.body.data.map((i: any) => i.key);
      expect(keys).toEqual([issueKey2, issueKey3, issueKey1]);
    });

    it('PATCH /issues/reorder — 404 for non-existent issue', async () => {
      await asOwner()
        .patch('/api/v1/issues/reorder')
        .send({
          issues: [
            { id: '00000000-0000-0000-0000-000000000000', sortOrder: 1000 },
          ],
        })
        .expect(404);
    });
  });

  // =========================================
  // Move Issue Between Statuses
  // =========================================
  describe('Move Issue Between Statuses', () => {
    it('PATCH /issues/:key — move issue to new status via statusId', async () => {
      const inProgressStatus = statuses.find((s: any) => s.category === 'in_progress');
      expect(inProgressStatus).toBeDefined();

      await asOwner()
        .patch(`/api/v1/issues/${issueKey1}`)
        .send({ statusId: inProgressStatus.id })
        .expect(200);

      // Verify
      const res = await asOwner()
        .get(`/api/v1/issues/${issueKey1}`)
        .expect(200);
      expect(res.body.statusId).toBe(inProgressStatus.id);
    });

    it('PATCH /issues/:key — status change creates activity log', async () => {
      const doneStatus = statuses.find((s: any) => s.category === 'done');
      expect(doneStatus).toBeDefined();

      await asOwner()
        .patch(`/api/v1/issues/${issueKey2}`)
        .send({ statusId: doneStatus.id })
        .expect(200);

      // Check activity log
      const activityRes = await asOwner()
        .get(`/api/v1/issues/${issueKey2}/activity`)
        .expect(200);
      const moveActivity = activityRes.body.find(
        (a: any) => a.action === 'updated' && a.fieldName === 'status',
      );
      expect(moveActivity).toBeDefined();
    });
  });

  // =========================================
  // Move Issue Between Sprints
  // =========================================
  describe('Move Issue Between Sprints', () => {
    let sprintId: string;

    beforeAll(async () => {
      // Create a sprint
      const sprintRes = await asOwner()
        .post(`/api/v1/sprints?projectId=${projectId}`)
        .send({ name: 'DnD Sprint 1' })
        .expect(201);
      sprintId = sprintRes.body.id;
    });

    it('PATCH /issues/:key — assign issue to sprint via sprintId', async () => {
      await asOwner()
        .patch(`/api/v1/issues/${issueKey3}`)
        .send({ sprintId })
        .expect(200);

      const res = await asOwner()
        .get(`/api/v1/issues/${issueKey3}`)
        .expect(200);
      expect(res.body.sprintId).toBe(sprintId);
    });

    it('PATCH /issues/:key — remove issue from sprint (null)', async () => {
      await asOwner()
        .patch(`/api/v1/issues/${issueKey3}`)
        .send({ sprintId: null })
        .expect(200);

      const res = await asOwner()
        .get(`/api/v1/issues/${issueKey3}`)
        .expect(200);
      expect(res.body.sprintId).toBeNull();
    });
  });

  // =========================================
  // Permission Checks
  // =========================================
  describe('Permission Checks', () => {
    it('Viewer cannot reorder (403)', async () => {
      await asViewer()
        .patch('/api/v1/issues/reorder')
        .send({
          issues: [{ id: issueId1, sortOrder: 5000 }],
        })
        .expect(403);
    });

    it('Viewer cannot move issue status (403)', async () => {
      const inProgressStatus = statuses.find((s: any) => s.category === 'in_progress');
      await asViewer()
        .patch(`/api/v1/issues/${issueKey1}`)
        .send({ statusId: inProgressStatus.id })
        .expect(403);
    });

    it('Member can reorder (204)', async () => {
      await asMember()
        .patch('/api/v1/issues/reorder')
        .send({
          issues: [{ id: issueId1, sortOrder: 9000 }],
        })
        .expect(204);
    });

    it('Member can move issue status (200)', async () => {
      // Use the first available status
      const targetStatus = statuses[0];
      expect(targetStatus).toBeDefined();
      await asMember()
        .patch(`/api/v1/issues/${issueKey1}`)
        .send({ statusId: targetStatus.id })
        .expect(200);
    });
  });
});
