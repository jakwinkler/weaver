import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TenantConnectionProvider } from '../src/core/tenant';

describe('Sprint Reports (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let connections: TenantConnectionProvider;
  let accessToken: string;
  let tenantId: string;
  let projectId: string;
  let terminalStatusId: string;
  let inProgressStatusId: string;
  let reportSprintId: string;
  const today = new Date().toISOString().split('T')[0];

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
        email: 'sprint-reports-test@example.com',
        password: 'password123',
        displayName: 'Sprint Reports Tester',
        orgName: 'Sprint Reports Test Org',
        orgSlug: 'sprint-reports-test-org',
      })
      .expect(201);

    accessToken = registration.body.accessToken;
    tenantId = registration.body.tenantId;

    const project = await authedRequest()
      .post('/api/v1/projects')
      .send({ name: 'Reported Project', key: 'REP' })
      .expect(201);
    projectId = project.body.id;

    const workflows = await authedRequest().get('/api/v1/workflows').expect(200);
    const defaultWorkflow = workflows.body.find((item: { isDefault: boolean }) => item.isDefault);
    const workflow = await authedRequest()
      .get(`/api/v1/workflows/${defaultWorkflow.id}`)
      .expect(200);
    inProgressStatusId = workflow.body.statuses.find((s: any) => s.category === 'in_progress').id;
    terminalStatusId = workflow.body.statuses.find(
      (status: { isTerminal: boolean }) => status.isTerminal,
    ).id;
  });

  afterAll(async () => {
    if (!dataSource || !connections || !app) return;
    await dataSource.query('DROP SCHEMA IF EXISTS "tenant_sprint_reports_test_org" CASCADE');
    await dataSource.query(
      "DELETE FROM public.tenant_memberships WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug = 'sprint-reports-test-org')",
    );
    await dataSource.query("DELETE FROM public.tenants WHERE slug = 'sprint-reports-test-org'");
    await dataSource.query(
      "DELETE FROM public.users WHERE email = 'sprint-reports-test@example.com'",
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

  const createIssue = async (summary: string, storyPoints: number) => {
    const response = await authedRequest()
      .post('/api/v1/projects/REP/issues')
      .send({ summary, storyPoints })
      .expect(201);
    return response.body as { id: string; key: string };
  };

  it('returns a 13-point burndown with 8 points remaining after one issue completes', async () => {
    const issues = [
      await createIssue('Three point issue', 3),
      await createIssue('First five point issue', 5),
      await createIssue('Second five point issue', 5),
    ];

    const sprint = await authedRequest()
      .post(`/api/v1/sprints?projectId=${projectId}`)
      .send({ name: 'Report Sprint', startDate: today, endDate: today })
      .expect(201);
    reportSprintId = sprint.body.id;

    await authedRequest()
      .post(`/api/v1/sprints/${reportSprintId}/issues`)
      .send({ issueIds: issues.map((issue) => issue.id) })
      .expect(201);

    const started = await authedRequest()
      .post(`/api/v1/sprints/${reportSprintId}/start`)
      .expect(201);
    expect(started.body.initialScope.issues).toHaveLength(3);

    await authedRequest()
      .patch(`/api/v1/issues/${issues[1].key}`)
      .send({ statusId: inProgressStatusId }).expect(200);
    await authedRequest()
      .patch(`/api/v1/issues/${issues[1].key}`)
      .send({ statusId: terminalStatusId })
      .expect(200);

    const response = await authedRequest()
      .get(`/api/v1/sprints/${reportSprintId}/burndown`)
      .expect(200);

    expect(response.body).toEqual([
      {
        date: today,
        totalPoints: 13,
        remainingPoints: 8,
        idealRemaining: 0,
      },
    ]);
  });

  it('summarizes completed work and an issue added after sprint start', async () => {
    const addedIssue = await createIssue('Added during sprint', 2);
    await authedRequest()
      .post(`/api/v1/sprints/${reportSprintId}/issues`)
      .send({ issueIds: [addedIssue.id] })
      .expect(201);

    const response = await authedRequest()
      .get(`/api/v1/sprints/${reportSprintId}/summary`)
      .expect(200);

    expect(response.body).toMatchObject({
      sprintId: reportSprintId,
      sprintName: 'Report Sprint',
      totalIssues: 4,
      completedIssues: 1,
      addedMidSprint: 1,
      removedMidSprint: 0,
      totalPointsCommitted: 13,
      completedPoints: 5,
      carryOverPoints: 10,
      completionPercentage: 25,
    });

    await authedRequest().post(`/api/v1/sprints/${reportSprintId}/complete`).expect(201);
  });

  it('returns committed and completed velocity for the last completed sprints', async () => {
    const issues = [
      await createIssue('Velocity complete issue', 2),
      await createIssue('Velocity carry-over issue', 3),
    ];
    const sprint = await authedRequest()
      .post(`/api/v1/sprints?projectId=${projectId}`)
      .send({ name: 'Velocity Sprint', startDate: today, endDate: today })
      .expect(201);

    await authedRequest()
      .post(`/api/v1/sprints/${sprint.body.id}/issues`)
      .send({ issueIds: issues.map((issue) => issue.id) })
      .expect(201);
    await authedRequest().post(`/api/v1/sprints/${sprint.body.id}/start`).expect(201);
    await authedRequest()
      .patch(`/api/v1/issues/${issues[0].key}`)
      .send({ statusId: inProgressStatusId }).expect(200);
    await authedRequest()
      .patch(`/api/v1/issues/${issues[0].key}`)
      .send({ statusId: terminalStatusId })
      .expect(200);
    await authedRequest().post(`/api/v1/sprints/${sprint.body.id}/complete`).expect(201);

    const response = await authedRequest().get('/api/v1/projects/REP/velocity?limit=2').expect(200);

    expect(response.body).toEqual([
      {
        sprintId: reportSprintId,
        sprintName: 'Report Sprint',
        committedPoints: 13,
        completedPoints: 5,
        dates: { startDate: today, endDate: today },
      },
      {
        sprintId: sprint.body.id,
        sprintName: 'Velocity Sprint',
        committedPoints: 5,
        completedPoints: 2,
        dates: { startDate: today, endDate: today },
      },
    ]);
  });
});
