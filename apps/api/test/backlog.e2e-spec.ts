import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TenantConnectionProvider } from '../src/core/tenant';

describe('Backlog and sprint planning (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let connections: TenantConnectionProvider;
  let token: string;
  let tenantId: string;
  let userId: string;
  let projectId: string;
  let sprintId: string;
  let backlogIssueKey: string;
  let secondBacklogIssueKey: string;
  let sprintIssueKey: string;
  let doneStatusId: string;
  let inProgressStatusId: string;
  let issueTypeId: string;

  const authedRequest = () => ({
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
  });

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
        email: 'backlog-owner@test.com',
        password: 'password123',
        displayName: 'Backlog Owner',
        orgName: 'Backlog Test Org',
        orgSlug: 'backlog-test-org',
      })
      .expect(201);

    token = registerRes.body.accessToken;
    tenantId = registerRes.body.tenantId;
    userId = registerRes.body.user.id;

    const projectRes = await authedRequest()
      .post('/api/v1/projects')
      .send({ name: 'Planning Project', key: 'PLAN' })
      .expect(201);
    projectId = projectRes.body.id;

    const workflowRes = await authedRequest()
      .get(`/api/v1/workflows/${projectRes.body.workflowId}`)
      .expect(200);
    inProgressStatusId = workflowRes.body.statuses.find((s: any) => s.category === 'in_progress').id;
    doneStatusId = workflowRes.body.statuses.find(
      (status: { category: string }) => status.category === 'done',
    ).id;

    const issueTypesRes = await authedRequest().get('/api/v1/issue-types').expect(200);
    issueTypeId = issueTypesRes.body[0].id;

    const sprintRes = await authedRequest()
      .post(`/api/v1/sprints?projectId=${projectId}`)
      .send({ name: 'Planning Sprint', capacity: 8 })
      .expect(201);
    sprintId = sprintRes.body.id;

    const backlogIssue = await authedRequest()
      .post('/api/v1/projects/PLAN/issues')
      .send({
        summary: 'High priority backlog issue',
        priority: 'high',
        assigneeId: userId,
        issueTypeId,
        storyPoints: 3,
      })
      .expect(201);
    backlogIssueKey = backlogIssue.body.key;

    const secondBacklogIssue = await authedRequest()
      .post('/api/v1/projects/PLAN/issues')
      .send({ summary: 'Unassigned backlog issue', priority: 'low', storyPoints: 2 })
      .expect(201);
    secondBacklogIssueKey = secondBacklogIssue.body.key;

    const sprintIssue = await authedRequest()
      .post('/api/v1/projects/PLAN/issues')
      .send({ summary: 'Committed issue', storyPoints: 5 })
      .expect(201);
    sprintIssueKey = sprintIssue.body.key;

    await authedRequest()
      .patch(`/api/v1/issues/${sprintIssueKey}/sprint`)
      .send({ sprintId })
      .expect(200);
  });

  afterAll(async () => {
    await connections?.closeAll();

    if (dataSource?.isInitialized) {
      await dataSource.query('DROP SCHEMA IF EXISTS "tenant_backlog_test_org" CASCADE');
      await dataSource.query(
        `DELETE FROM public.tenant_memberships
         WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug = 'backlog-test-org')`,
      );
      await dataSource.query(
        `DELETE FROM public.installed_plugins
         WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug = 'backlog-test-org')`,
      );
      await dataSource.query("DELETE FROM public.tenants WHERE slug = 'backlog-test-org'");
      await dataSource.query("DELETE FROM public.users WHERE email = 'backlog-owner@test.com'");
    }

    await app?.close();
  });

  it('returns only unassigned issues with pagination metadata', async () => {
    const res = await authedRequest()
      .get('/api/v1/projects/PLAN/backlog?page=1&perPage=20')
      .expect(200);

    expect(res.body.meta).toMatchObject({ page: 1, perPage: 20, total: 2, totalPages: 1 });
    expect(res.body.data.map((issue: { key: string }) => issue.key)).toEqual([
      backlogIssueKey,
      secondBacklogIssueKey,
    ]);
    expect(
      res.body.data.every((issue: { sprintId: string | null }) => issue.sprintId === null),
    ).toBe(true);
  });

  it('filters backlog issues by priority, assignee, and issue type', async () => {
    const priorityRes = await authedRequest()
      .get('/api/v1/projects/PLAN/backlog?priority=high')
      .expect(200);
    expect(priorityRes.body.data.map((issue: { key: string }) => issue.key)).toEqual([
      backlogIssueKey,
    ]);

    const assigneeRes = await authedRequest()
      .get(`/api/v1/projects/PLAN/backlog?assigneeId=${userId}`)
      .expect(200);
    expect(assigneeRes.body.data.map((issue: { key: string }) => issue.key)).toEqual([
      backlogIssueKey,
    ]);

    const issueTypeRes = await authedRequest()
      .get(`/api/v1/projects/PLAN/backlog?issueTypeId=${issueTypeId}`)
      .expect(200);
    expect(issueTypeRes.body.data.map((issue: { key: string }) => issue.key)).toEqual([
      backlogIssueKey,
    ]);
  });

  it('moves an issue into a sprint and removes it from the backlog', async () => {
    const moveRes = await authedRequest()
      .patch(`/api/v1/issues/${backlogIssueKey}/sprint`)
      .send({ sprintId, sortOrder: 2000 })
      .expect(200);

    expect(moveRes.body.sprintId).toBe(sprintId);
    expect(moveRes.body.sortOrder).toBe(2000);

    const backlogRes = await authedRequest().get('/api/v1/projects/PLAN/backlog').expect(200);
    expect(backlogRes.body.data.map((issue: { key: string }) => issue.key)).not.toContain(
      backlogIssueKey,
    );

    const activityRes = await authedRequest()
      .get(`/api/v1/issues/${backlogIssueKey}/activity`)
      .expect(200);
    expect(
      activityRes.body.some(
        (activity: { fieldName: string; newValue: string }) =>
          activity.fieldName === 'sprint' && activity.newValue === 'Planning Sprint',
      ),
    ).toBe(true);
  });

  it('moves an issue back to the backlog', async () => {
    await authedRequest()
      .patch(`/api/v1/issues/${backlogIssueKey}/sprint`)
      .send({ sprintId: null })
      .expect(200);

    const backlogRes = await authedRequest().get('/api/v1/projects/PLAN/backlog').expect(200);
    expect(backlogRes.body.data.map((issue: { key: string }) => issue.key)).toContain(
      backlogIssueKey,
    );
  });

  it('returns sprint capacity and completion stats from story points', async () => {
    await authedRequest()
      .patch(`/api/v1/issues/${backlogIssueKey}/sprint`)
      .send({ sprintId })
      .expect(200);
    await authedRequest()
      .patch(`/api/v1/issues/${backlogIssueKey}`)
      .send({ statusId: inProgressStatusId }).expect(200);
    await authedRequest()
      .patch(`/api/v1/issues/${backlogIssueKey}`)
      .send({ statusId: doneStatusId })
      .expect(200);

    const res = await authedRequest().get(`/api/v1/sprints/${sprintId}/stats`).expect(200);

    expect(res.body).toEqual({
      sprintId,
      capacity: 8,
      committedPoints: 8,
      issueCount: 2,
      completedCount: 1,
      completedPoints: 3,
    });
  });
});
