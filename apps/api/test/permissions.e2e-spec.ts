import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { TenantConnectionProvider } from '../src/core/tenant';

const COMMENT_BODY = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'test' }] }] };

describe('Permissions (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let connections: TenantConnectionProvider;

  let ownerToken: string;
  let viewerToken: string;
  let memberToken: string;
  let viewerUserId: string;
  let memberUserId: string;
  let tenantId: string;

  // Test data IDs
  let projectId: string;
  let issueKey: string;
  let issueId: string;
  let commentId: string;
  let issueTypeId: string;
  let privateProjectId: string;
  let privateIssueKey: string;

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
        email: 'perm-owner@test.com',
        password: 'password123',
        displayName: 'Perm Owner',
        orgName: 'Perm Test Org',
        orgSlug: 'perm-test-org',
      });

    ownerToken = registerRes.body.accessToken;
    tenantId = registerRes.body.tenantId;

    // 2. Create viewer user via direct DB insert
    const passwordHash = await bcrypt.hash('password123', 10);

    await dataSource.query(
      `INSERT INTO public.users (id, email, display_name, password_hash, auth_provider, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'local', NOW(), NOW())`,
      ['perm-viewer@test.com', 'Perm Viewer', passwordHash],
    );
    const [viewerUser] = await dataSource.query(
      `SELECT id FROM public.users WHERE email = $1`,
      ['perm-viewer@test.com'],
    );
    viewerUserId = viewerUser.id;
    await dataSource.query(
      `INSERT INTO public.tenant_memberships (tenant_id, user_id, role, created_at)
       VALUES ($1, $2, 'viewer', NOW())`,
      [tenantId, viewerUser.id],
    );

    // 3. Create member user via direct DB insert
    await dataSource.query(
      `INSERT INTO public.users (id, email, display_name, password_hash, auth_provider, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'local', NOW(), NOW())`,
      ['perm-member@test.com', 'Perm Member', passwordHash],
    );
    const [memberUser] = await dataSource.query(
      `SELECT id FROM public.users WHERE email = $1`,
      ['perm-member@test.com'],
    );
    memberUserId = memberUser.id;
    await dataSource.query(
      `INSERT INTO public.tenant_memberships (tenant_id, user_id, role, created_at)
       VALUES ($1, $2, 'member', NOW())`,
      [tenantId, memberUser.id],
    );

    // 4. Login viewer & member
    const viewerLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'perm-viewer@test.com', password: 'password123' });
    viewerToken = viewerLogin.body.accessToken;

    const memberLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'perm-member@test.com', password: 'password123' });
    memberToken = memberLogin.body.accessToken;

    // 5. Create test data as owner: project, issue, comment
    const projectRes = await asOwner()
      .post('/api/v1/projects')
      .send({ name: 'Perm Project', key: 'PERM' })
      .expect(201);
    projectId = projectRes.body.id;

    await asOwner()
      .post('/api/v1/projects/PERM/members')
      .send({ userId: viewerUserId, role: 'viewer' })
      .expect(201);
    await asOwner()
      .post('/api/v1/projects/PERM/members')
      .send({ userId: memberUserId, role: 'member' })
      .expect(201);

    const issueRes = await asOwner()
      .post('/api/v1/projects/PERM/issues')
      .send({ summary: 'Perm Test Issue' })
      .expect(201);
    issueKey = issueRes.body.key;
    issueId = issueRes.body.id;

    const commentRes = await asOwner()
      .post(`/api/v1/issues/${issueKey}/comments`)
      .send({ body: COMMENT_BODY })
      .expect(201);
    commentId = commentRes.body.id;

    const privateProject = await asOwner()
      .post('/api/v1/projects')
      .send({ name: 'Owner Only', key: 'SECRET' })
      .expect(201);
    privateProjectId = privateProject.body.id;
    const privateIssue = await asOwner()
      .post('/api/v1/projects/SECRET/issues')
      .send({ summary: 'Private issue' })
      .expect(201);
    privateIssueKey = privateIssue.body.key;
  });

  afterAll(async () => {
    await dataSource.query(
      `DROP SCHEMA IF EXISTS "tenant_perm_test_org" CASCADE`,
    );
    await dataSource.query(
      `DELETE FROM public.tenant_memberships WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug = 'perm-test-org')`,
    );
    await dataSource.query(
      `DELETE FROM public.installed_plugins WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug = 'perm-test-org')`,
    );
    await dataSource.query(
      `DELETE FROM public.tenants WHERE slug = 'perm-test-org'`,
    );
    await dataSource.query(
      `DELETE FROM public.users WHERE email IN ('perm-owner@test.com', 'perm-viewer@test.com', 'perm-member@test.com')`,
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
  // VIEWER ROLE — Allowed (200)
  // =========================================
  describe('Viewer Role — Allowed', () => {
    it('GET /issues/:key/comments — read comments', async () => {
      await asViewer()
        .get(`/api/v1/issues/${issueKey}/comments`)
        .expect(200);
    });

    it('GET /issues/:key/activity — read activity', async () => {
      await asViewer()
        .get(`/api/v1/issues/${issueKey}/activity`)
        .expect(200);
    });

    it('GET /boards — read boards', async () => {
      await asViewer()
        .get(`/api/v1/boards?projectId=${projectId}`)
        .expect(200);
    });

    it('GET /sprints — read sprints', async () => {
      await asViewer()
        .get(`/api/v1/sprints?projectId=${projectId}`)
        .expect(200);
    });

    it('GET /issues/:key/time-entries — read time entries', async () => {
      await asViewer()
        .get(`/api/v1/issues/${issueKey}/time-entries`)
        .expect(200);
    });

    it('GET /issue-links/by-issue/:id — read issue links', async () => {
      await asViewer()
        .get(`/api/v1/issue-links/by-issue/${issueId}`)
        .expect(200);
    });

    it('GET /issue-types — read issue types', async () => {
      await asViewer().get('/api/v1/issue-types').expect(200);
    });

    it('POST /search — search', async () => {
      const res = await asViewer()
        .post('/api/v1/search')
        .send({ query: 'test' });
      // Search requires valid WQL or text — any non-403 means permission passed
      expect(res.status).not.toBe(403);
    });

    it('GET /dashboard — dashboard', async () => {
      await asViewer().get('/api/v1/dashboard').expect(200);
    });
  });

  describe('Private project membership', () => {
    it('filters private projects from non-members', async () => {
      const response = await asViewer().get('/api/v1/projects').expect(200);
      expect(response.body.data.map((project: { key: string }) => project.key)).toContain('PERM');
      expect(response.body.data.map((project: { key: string }) => project.key)).not.toContain('SECRET');
    });

    it('blocks direct access to a private project and its data', async () => {
      await asViewer().get('/api/v1/projects/SECRET').expect(403);
      await asViewer().get('/api/v1/projects/SECRET/issues').expect(403);
      await asViewer().get(`/api/v1/issues/${privateIssueKey}`).expect(403);
      await asViewer().get(`/api/v1/boards?projectId=${privateProjectId}`).expect(403);
      await asViewer().get(`/api/v1/sprints?projectId=${privateProjectId}`).expect(403);
      await asViewer().get(`/api/v1/issues/${privateIssueKey}/comments`).expect(403);
    });

    it('excludes private project data from search and dashboard aggregates', async () => {
      const search = await asViewer()
        .post('/api/v1/search')
        .send({ query: 'summary ~ "Private issue"' })
        .expect(201);
      expect(search.body.data).toHaveLength(0);

      const dashboard = await asViewer().get('/api/v1/dashboard').expect(200);
      expect(dashboard.body.stats.totalProjects).toBe(1);
      expect(dashboard.body.projectOverviews.map((project: { key: string }) => project.key))
        .not.toContain('SECRET');
    });
  });

  // =========================================
  // VIEWER ROLE — Forbidden (403)
  // =========================================
  describe('Viewer Role — Forbidden', () => {
    it('POST /issues/:key/comments — create comment', async () => {
      await asViewer()
        .post(`/api/v1/issues/${issueKey}/comments`)
        .send({ body: COMMENT_BODY })
        .expect(403);
    });

    it('PATCH /issues/:key/comments/:id — update comment', async () => {
      await asViewer()
        .patch(`/api/v1/issues/${issueKey}/comments/${commentId}`)
        .send({ body: COMMENT_BODY })
        .expect(403);
    });

    it('DELETE /issues/:key/comments/:id — delete comment', async () => {
      await asViewer()
        .delete(`/api/v1/issues/${issueKey}/comments/${commentId}`)
        .expect(403);
    });

    it('POST /boards — create board', async () => {
      await asViewer()
        .post(`/api/v1/boards?projectId=${projectId}`)
        .send({ name: 'Viewer Board', type: 'kanban' })
        .expect(403);
    });

    it('POST /sprints — create sprint', async () => {
      await asViewer()
        .post(`/api/v1/sprints?projectId=${projectId}`)
        .send({ name: 'Viewer Sprint' })
        .expect(403);
    });

    it('POST /issues/:key/time-entries — create time entry', async () => {
      await asViewer()
        .post(`/api/v1/issues/${issueKey}/time-entries`)
        .send({ minutes: 60, description: 'Viewer time' })
        .expect(403);
    });

    it('POST /issue-links — create issue link', async () => {
      await asViewer()
        .post('/api/v1/issue-links')
        .send({
          sourceIssueId: issueId,
          targetIssueId: issueId,
          linkType: 'relates_to',
        })
        .expect(403);
    });

    it('POST /issue-types — create issue type', async () => {
      await asViewer()
        .post('/api/v1/issue-types')
        .send({ name: 'Viewer Type', slug: 'viewer-type' })
        .expect(403);
    });

    it('POST /webhooks — create webhook', async () => {
      await asViewer()
        .post('/api/v1/webhooks')
        .send({ url: 'https://example.com/hook', events: ['issue.created'] })
        .expect(403);
    });

    it('POST /attachments/upload — upload attachment', async () => {
      await asViewer()
        .post('/api/v1/attachments/upload')
        .expect(403);
    });
  });

  // =========================================
  // MEMBER ROLE — Allowed (200/201)
  // =========================================
  describe('Member Role — Allowed', () => {
    it('POST /issues/:key/comments — create comment', async () => {
      const res = await asMember()
        .post(`/api/v1/issues/${issueKey}/comments`)
        .send({ body: COMMENT_BODY })
        .expect(201);
      expect(res.body.id).toBeDefined();
    });

    it('GET /issues/:key/comments — read comments', async () => {
      await asMember()
        .get(`/api/v1/issues/${issueKey}/comments`)
        .expect(200);
    });

    it('GET /sprints — read sprints', async () => {
      await asMember()
        .get(`/api/v1/sprints?projectId=${projectId}`)
        .expect(200);
    });
  });

  // =========================================
  // MEMBER ROLE — Forbidden (403)
  // =========================================
  describe('Member Role — Forbidden', () => {
    it('POST /webhooks — create webhook', async () => {
      await asMember()
        .post('/api/v1/webhooks')
        .send({ url: 'https://example.com/hook', events: ['issue.created'] })
        .expect(403);
    });

    it('POST /issue-types — create issue type', async () => {
      await asMember()
        .post('/api/v1/issue-types')
        .send({ name: 'Member Type', slug: 'member-type' })
        .expect(403);
    });

    it('PATCH /issue-types/:id — update issue type', async () => {
      const types = await asOwner().get('/api/v1/issue-types').expect(200);
      const typeId = types.body[0].id;
      await asMember()
        .patch(`/api/v1/issue-types/${typeId}`)
        .send({ name: 'Hacked' })
        .expect(403);
    });

    it('DELETE /issue-types/:id — delete issue type', async () => {
      const types = await asOwner().get('/api/v1/issue-types').expect(200);
      const typeId = types.body[0].id;
      await asMember()
        .delete(`/api/v1/issue-types/${typeId}`)
        .expect(403);
    });
  });

  // =========================================
  // OWNER ROLE — Sanity (200/201/204)
  // =========================================
  describe('Owner Role — Sanity', () => {
    it('Full CRUD on comments', async () => {
      // Create
      const createRes = await asOwner()
        .post(`/api/v1/issues/${issueKey}/comments`)
        .send({ body: COMMENT_BODY })
        .expect(201);
      const cId = createRes.body.id;

      // Read
      await asOwner()
        .get(`/api/v1/issues/${issueKey}/comments`)
        .expect(200);

      // Update
      await asOwner()
        .patch(`/api/v1/issues/${issueKey}/comments/${cId}`)
        .send({ body: COMMENT_BODY })
        .expect(200);

      // Delete
      await asOwner()
        .delete(`/api/v1/issues/${issueKey}/comments/${cId}`)
        .expect(204);
    });

    it('POST /webhooks — owner can create webhook', async () => {
      const res = await asOwner()
        .post('/api/v1/webhooks')
        .send({
          url: 'https://example.com/hook',
          events: ['issue.created'],
          secret: 'test-secret-123',
        });
      expect([200, 201]).toContain(res.status);
    });

    it('Issue type CRUD', async () => {
      // Create
      const createRes = await asOwner()
        .post('/api/v1/issue-types')
        .send({ name: 'Owner Type', slug: 'owner-type' });
      expect([200, 201]).toContain(createRes.status);
      issueTypeId = createRes.body.id;

      // Update
      const updateRes = await asOwner()
        .patch(`/api/v1/issue-types/${issueTypeId}`)
        .send({ name: 'Updated Owner Type' });
      expect(updateRes.status).toBe(200);

      // Delete
      await asOwner()
        .delete(`/api/v1/issue-types/${issueTypeId}`)
        .expect(204);
    });
  });
});
