import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TenantConnectionProvider } from '../src/core/tenant';

describe('Story Points (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let connections: TenantConnectionProvider;
  let accessToken: string;
  let tenantId: string;
  let projectId: string;
  let sprintId: string;
  let boardId: string;
  let pointedIssueId: string;
  let pointedIssueKey: string;
  let initialStatusId: string;
  let terminalStatusId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    dataSource = app.get(DataSource);
    connections = app.get(TenantConnectionProvider);

    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'story-points-test@example.com',
        password: 'password123',
        displayName: 'Story Points Tester',
        orgName: 'Story Points Test Org',
        orgSlug: 'story-points-test-org',
      })
      .expect(201);

    accessToken = registration.body.accessToken;
    tenantId = registration.body.tenant.id;

    const project = await authedRequest()
      .post('/api/v1/projects')
      .send({ name: 'Estimated Project', key: 'EST' })
      .expect(201);
    projectId = project.body.id;

    const workflow = await authedRequest().get('/api/v1/workflows').expect(200);
    const defaultWorkflow = workflow.body.find((item: { isDefault: boolean }) => item.isDefault);
    const workflowDetail = await authedRequest()
      .get(`/api/v1/workflows/${defaultWorkflow.id}`)
      .expect(200);
    initialStatusId = workflowDetail.body.statuses.find(
      (status: { isInitial: boolean }) => status.isInitial,
    ).id;
    terminalStatusId = workflowDetail.body.statuses.find(
      (status: { isTerminal: boolean }) => status.isTerminal,
    ).id;

    const sprint = await authedRequest()
      .post(`/api/v1/sprints?projectId=${projectId}`)
      .send({ name: 'Estimated Sprint' })
      .expect(201);
    sprintId = sprint.body.id;

    const board = await authedRequest()
      .post(`/api/v1/boards?projectId=${projectId}`)
      .send({ name: 'Estimated Board', type: 'kanban' })
      .expect(201);
    boardId = board.body.id;
  });

  afterAll(async () => {
    if (!dataSource || !connections || !app) return;
    await dataSource.query('DROP SCHEMA IF EXISTS "tenant_story_points_test_org" CASCADE');
    await dataSource.query(
      "DELETE FROM public.tenant_memberships WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug = 'story-points-test-org')",
    );
    await dataSource.query("DELETE FROM public.tenants WHERE slug = 'story-points-test-org'");
    await dataSource.query(
      "DELETE FROM public.users WHERE email = 'story-points-test@example.com'",
    );
    await connections.closeAll();
    await app.close();
  });

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

  it('creates an issue with story points and returns them from issue endpoints', async () => {
    const created = await authedRequest()
      .post('/api/v1/projects/EST/issues')
      .send({ summary: 'Pointed issue', storyPoints: 5 })
      .expect(201);

    pointedIssueId = created.body.id;
    pointedIssueKey = created.body.key;
    expect(created.body.storyPoints).toBe(5);

    const detail = await authedRequest().get(`/api/v1/issues/${pointedIssueKey}`).expect(200);
    expect(detail.body.storyPoints).toBe(5);

    const list = await authedRequest().get('/api/v1/projects/EST/issues').expect(200);
    expect(
      list.body.data.find((issue: { id: string }) => issue.id === pointedIssueId).storyPoints,
    ).toBe(5);
  });

  it('updates and clears story points', async () => {
    const updated = await authedRequest()
      .patch(`/api/v1/issues/${pointedIssueKey}`)
      .send({ storyPoints: 8 })
      .expect(200);
    expect(updated.body.storyPoints).toBe(8);

    const cleared = await authedRequest()
      .patch(`/api/v1/issues/${pointedIssueKey}`)
      .send({ storyPoints: null })
      .expect(200);
    expect(cleared.body.storyPoints).toBeNull();

    await authedRequest()
      .patch(`/api/v1/issues/${pointedIssueKey}`)
      .send({ storyPoints: 8 })
      .expect(200);
  });

  it('aggregates committed, completed, and board-column points', async () => {
    const completedIssue = await authedRequest()
      .post('/api/v1/projects/EST/issues')
      .send({ summary: 'Completed pointed issue', storyPoints: 5 })
      .expect(201);

    await authedRequest()
      .patch(`/api/v1/issues/${completedIssue.body.key}`)
      .send({ statusId: terminalStatusId })
      .expect(200);

    await authedRequest()
      .post(`/api/v1/sprints/${sprintId}/issues`)
      .send({ issueIds: [pointedIssueId, completedIssue.body.id] })
      .expect(201);

    const stats = await authedRequest().get(`/api/v1/sprints/${sprintId}/stats`).expect(200);
    expect(stats.body).toEqual({
      sprintId,
      capacity: null,
      committedPoints: 13,
      issueCount: 2,
      completedCount: 1,
      completedPoints: 5,
    });

    const board = await authedRequest().get(`/api/v1/boards/${boardId}/issues`).expect(200);
    expect(board.body.columnPointTotals).toEqual({
      [initialStatusId]: 8,
      [terminalStatusId]: 5,
    });
  });
});
