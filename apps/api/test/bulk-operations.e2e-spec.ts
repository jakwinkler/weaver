import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from '../src/app.module';
import { TenantConnectionProvider } from '../src/core/tenant';

jest.setTimeout(30_000);

describe('Bulk Operations (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let connections: TenantConnectionProvider;
  let ownerToken: string;
  let viewerToken: string;
  let tenantId: string;
  let projectId: string;
  let viewerUserId: string;
  let sprintId: string;
  let targetStatusId: string;
  let issueIds: string[];
  let issueKeys: string[];
  let attachmentStorageKey: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    dataSource = app.get(DataSource);
    connections = app.get(TenantConnectionProvider);

    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'bulk-owner@test.com',
        password: 'password123',
        displayName: 'Bulk Owner',
        orgName: 'Bulk Test Org',
        orgSlug: 'bulk-test-org',
      })
      .expect(201);

    ownerToken = registerRes.body.accessToken;
    tenantId = registerRes.body.tenantId;

    const passwordHash = await bcrypt.hash('password123', 10);
    await dataSource.query(
      `INSERT INTO public.users (id, email, display_name, password_hash, auth_provider, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'local', NOW(), NOW())`,
      ['bulk-viewer@test.com', 'Bulk Viewer', passwordHash],
    );
    const [viewerUser] = await dataSource.query(`SELECT id FROM public.users WHERE email = $1`, [
      'bulk-viewer@test.com',
    ]);
    viewerUserId = viewerUser.id;
    await dataSource.query(
      `INSERT INTO public.tenant_memberships (tenant_id, user_id, role, created_at)
       VALUES ($1, $2, 'viewer', NOW())`,
      [tenantId, viewerUser.id],
    );

    const viewerLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'bulk-viewer@test.com', password: 'password123' })
      .expect(201);
    viewerToken = viewerLogin.body.accessToken;

    const projectRes = await asOwner()
      .post('/api/v1/projects')
      .send({ name: 'Bulk Project', key: 'BULK' })
      .expect(201);
    projectId = projectRes.body.id;

    const workflowRes = await asOwner()
      .get(`/api/v1/workflows/${projectRes.body.workflowId}`)
      .expect(200);
    targetStatusId = workflowRes.body.statuses.find(
      (status: any) => status.category === 'in_progress',
    ).id;
    const sprintRes = await asOwner()
      .post(`/api/v1/sprints?projectId=${projectId}`)
      .send({ name: 'Bulk Sprint' })
      .expect(201);
    sprintId = sprintRes.body.id;

    issueIds = [];
    issueKeys = [];
    for (let index = 1; index <= 6; index += 1) {
      const issueRes = await asOwner()
        .post('/api/v1/projects/BULK/issues')
        .send({ summary: `Bulk issue ${index}` })
        .expect(201);
      issueIds.push(issueRes.body.id);
      issueKeys.push(issueRes.body.key);
    }

    await asOwner()
      .patch(`/api/v1/issues/${issueKeys[5]}`)
      .send({ parentId: issueIds[3], epicId: issueIds[3] })
      .expect(200);

    await asOwner()
      .post(`/api/v1/issues/${issueKeys[3]}/comments`)
      .send({
        body: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Related comment' }] }],
        },
      })
      .expect(201);
    await asOwner()
      .post(`/api/v1/issues/${issueKeys[3]}/time-entries`)
      .send({ minutes: 15, description: 'Related time entry' })
      .expect(201);
    await asOwner()
      .post('/api/v1/issue-links')
      .send({
        sourceIssueId: issueIds[3],
        targetIssueId: issueIds[5],
        linkType: 'relates_to',
      })
      .expect(201);
    const attachmentRes = await asOwner()
      .post(`/api/v1/issues/${issueKeys[3]}/attachments`)
      .attach('file', Buffer.from('bulk attachment'), 'bulk-attachment.txt')
      .expect(201);
    attachmentStorageKey = attachmentRes.body.storageKey;
  });

  afterAll(async () => {
    if (attachmentStorageKey) {
      const attachmentPath = path.join('/tmp/weaver-uploads', attachmentStorageKey);
      if (fs.existsSync(attachmentPath)) fs.unlinkSync(attachmentPath);
    }
    if (!dataSource) return;
    await dataSource.query('DROP SCHEMA IF EXISTS "tenant_bulk_test_org" CASCADE');
    await dataSource.query(
      `DELETE FROM public.tenant_memberships
       WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug = 'bulk-test-org')`,
    );
    await dataSource.query(
      `DELETE FROM public.installed_plugins
       WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug = 'bulk-test-org')`,
    );
    await dataSource.query(`DELETE FROM public.tenants WHERE slug = 'bulk-test-org'`);
    await dataSource.query(
      `DELETE FROM public.users WHERE email IN ('bulk-owner@test.com', 'bulk-viewer@test.com')`,
    );
    await connections.closeAll();
    await app.close();
  });

  const authedRequestWith = (token: string) => ({
    get: (url: string) =>
      request(app.getHttpServer())
        .get(url)
        .set('Authorization', `Bearer ${token}`)
        .set('X-Tenant-ID', tenantId),
    post: (url: string) =>
      request(app.getHttpServer())
        .post(url)
        .set('Authorization', `Bearer ${token}`)
        .set('X-Tenant-ID', tenantId),
    patch: (url: string) =>
      request(app.getHttpServer())
        .patch(url)
        .set('Authorization', `Bearer ${token}`)
        .set('X-Tenant-ID', tenantId),
    delete: (url: string) =>
      request(app.getHttpServer())
        .delete(url)
        .set('Authorization', `Bearer ${token}`)
        .set('X-Tenant-ID', tenantId),
  });

  function asOwner() {
    return authedRequestWith(ownerToken);
  }

  function asViewer() {
    return authedRequestWith(viewerToken);
  }

  it('bulk updates three issues and records activity', async () => {
    const selectedIds = issueIds.slice(0, 3);
    const res = await asOwner()
      .patch('/api/v1/issues/bulk')
      .send({ issueIds: selectedIds, updates: { priority: 'high' } })
      .expect(200);

    expect(res.body).toHaveLength(3);
    expect(res.body.every((issue: any) => issue.priority === 'high')).toBe(true);

    for (const issueKey of issueKeys.slice(0, 3)) {
      const issueRes = await asOwner().get(`/api/v1/issues/${issueKey}`).expect(200);
      expect(issueRes.body.priority).toBe('high');

      const activityRes = await asOwner().get(`/api/v1/issues/${issueKey}/activity`).expect(200);
      expect(
        activityRes.body.some(
          (entry: any) =>
            entry.action === 'bulk_updated' &&
            entry.fieldName === 'priority' &&
            entry.oldValue === 'medium' &&
            entry.newValue === 'high',
        ),
      ).toBe(true);
    }
  });

  it('rejects more than 100 issue IDs with a clear message', async () => {
    const res = await asOwner()
      .patch('/api/v1/issues/bulk')
      .send({
        issueIds: Array.from({ length: 101 }, () => issueIds[0]),
        updates: { priority: 'lowest' },
      })
      .expect(400);

    expect(JSON.stringify(res.body)).toContain('Bulk operations are limited to 100 issues');
  });

  it('bulk changes status, assignee, sprint, and labels', async () => {
    const res = await asOwner()
      .patch('/api/v1/issues/bulk')
      .send({
        issueIds: [issueIds[2]],
        updates: {
          statusId: targetStatusId,
          assigneeId: viewerUserId,
          sprintId,
          labels: ['triaged', 'bulk'],
        },
      })
      .expect(200);

    expect(res.body[0]).toMatchObject({
      statusId: targetStatusId,
      assigneeId: viewerUserId,
      sprintId,
      labels: ['triaged', 'bulk'],
    });
  });

  it('viewer cannot bulk update or bulk delete', async () => {
    await asViewer()
      .patch('/api/v1/issues/bulk')
      .send({ issueIds: [issueIds[0]], updates: { priority: 'highest' } })
      .expect(403);

    await asViewer()
      .delete('/api/v1/issues/bulk')
      .send({ issueIds: [issueIds[0]] })
      .expect(403);
  });

  it('rolls back the full update when any issue is missing', async () => {
    const missingId = '00000000-0000-0000-0000-000000000000';
    await asOwner()
      .patch('/api/v1/issues/bulk')
      .send({ issueIds: [issueIds[0], missingId], updates: { priority: 'highest' } })
      .expect(404);

    const issueRes = await asOwner().get(`/api/v1/issues/${issueKeys[0]}`).expect(200);
    expect(issueRes.body.priority).toBe('high');
  });

  it('bulk deletes issues and their related data in one operation', async () => {
    await asOwner()
      .delete('/api/v1/issues/bulk')
      .send({ issueIds: [issueIds[3], issueIds[4]] })
      .expect(200)
      .expect({ count: 2 });

    await asOwner().get(`/api/v1/issues/${issueKeys[3]}`).expect(404);
    await asOwner().get(`/api/v1/issues/${issueKeys[4]}`).expect(404);
    const remainingIssue = await asOwner().get(`/api/v1/issues/${issueKeys[5]}`).expect(200);
    expect(remainingIssue.body.parentId).toBeNull();
    expect(remainingIssue.body.epicId).toBeNull();

    const tenantRows = await dataSource.query(
      `SELECT
        (SELECT COUNT(*) FROM "tenant_bulk_test_org".comments WHERE issue_id = $1)::int AS comments,
        (SELECT COUNT(*) FROM "tenant_bulk_test_org".time_entries WHERE issue_id = $1)::int AS time_entries,
        (SELECT COUNT(*) FROM "tenant_bulk_test_org".attachments WHERE issue_id = $1)::int AS attachments,
        (SELECT COUNT(*) FROM "tenant_bulk_test_org".issue_links
          WHERE source_issue_id = $1 OR target_issue_id = $1)::int AS links`,
      [issueIds[3]],
    );
    expect(tenantRows[0]).toEqual({ comments: 0, time_entries: 0, attachments: 0, links: 0 });
    expect(fs.existsSync(path.join('/tmp/weaver-uploads', attachmentStorageKey))).toBe(false);
  });

  it('keeps the project usable after bulk operations', async () => {
    const res = await asOwner().get(`/api/v1/projects/BULK/issues?perPage=100`).expect(200);
    expect(res.body.data).toHaveLength(4);
    expect(res.body.data.every((issue: any) => issue.projectId === projectId)).toBe(true);
  });
});
