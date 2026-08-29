import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TenantConnectionProvider } from '../src/core/tenant';

describe('Board configuration and swimlanes (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let connections: TenantConnectionProvider;
  let accessToken: string;
  let tenantId: string;
  let userId: string;
  let projectId: string;
  let projectKey: string;
  let boardId: string;
  let statusId: string;
  let epicId: string;

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
        email: 'board-config-test@example.com',
        password: 'password123',
        displayName: 'Board Config Tester',
        orgName: 'Board Config Test Org',
        orgSlug: 'board-config-test-org',
      })
      .expect(201);

    accessToken = registration.body.accessToken;
    tenantId = registration.body.tenant.id;
    userId = registration.body.user.id;

    const project = await authedRequest()
      .post('/api/v1/projects')
      .send({ name: 'Board Configuration', key: 'BCF' })
      .expect(201);
    projectId = project.body.id;
    projectKey = project.body.key;

    const epic = await authedRequest()
      .post(`/api/v1/projects/${projectKey}/issues`)
      .send({ summary: 'Authentication epic', priority: 'highest', assigneeId: userId })
      .expect(201);
    epicId = epic.body.id;
    statusId = epic.body.statusId;

    await authedRequest()
      .post(`/api/v1/projects/${projectKey}/issues`)
      .send({ summary: 'Assigned work', priority: 'high', assigneeId: userId, epicId })
      .expect(201);
    await authedRequest()
      .post(`/api/v1/projects/${projectKey}/issues`)
      .send({ summary: 'Unassigned work', priority: 'low' })
      .expect(201);

    const board = await authedRequest()
      .post(`/api/v1/boards?projectId=${projectId}`)
      .send({ name: 'Delivery Board', type: 'kanban' })
      .expect(201);
    boardId = board.body.id;
  });

  afterAll(async () => {
    await dataSource.query('DROP SCHEMA IF EXISTS "tenant_board_config_test_org" CASCADE');
    await dataSource.query(
      "DELETE FROM public.tenant_memberships WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug = 'board-config-test-org')",
    );
    await dataSource.query("DELETE FROM public.tenants WHERE slug = 'board-config-test-org'");
    await dataSource.query(
      "DELETE FROM public.users WHERE email = 'board-config-test@example.com'",
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

  it('rejects invalid board configuration', async () => {
    await authedRequest()
      .patch(`/api/v1/boards/${boardId}`)
      .send({ config: { swimlaneField: 'team' } })
      .expect(400);
    await authedRequest()
      .patch(`/api/v1/boards/${boardId}`)
      .send({ config: { wipLimits: { [statusId]: 0 } } })
      .expect(400);
  });

  it('persists swimlane and WIP configuration', async () => {
    const update = await authedRequest()
      .patch(`/api/v1/boards/${boardId}`)
      .send({
        config: {
          swimlaneField: 'assignee',
          wipLimits: { [statusId]: 2 },
        },
      })
      .expect(200);

    expect(update.body.config).toEqual({
      swimlaneField: 'assignee',
      wipLimits: { [statusId]: 2 },
    });

    const board = await authedRequest().get(`/api/v1/boards/${boardId}`).expect(200);
    expect(board.body.config).toEqual(update.body.config);
  });

  it('groups board issues by assignee with readable labels', async () => {
    const response = await authedRequest().get(`/api/v1/boards/${boardId}/issues`).expect(200);

    expect(response.body.groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: userId, label: 'Board Config Tester' }),
        expect.objectContaining({ value: null, label: 'Unassigned' }),
      ]),
    );
    expect(response.body.groups.flatMap((group: any) => group.issues)).toHaveLength(3);
  });

  it('groups board issues by priority and epic', async () => {
    await authedRequest()
      .patch(`/api/v1/boards/${boardId}`)
      .send({ config: { swimlaneField: 'priority' } })
      .expect(200);
    const priorities = await authedRequest().get(`/api/v1/boards/${boardId}/issues`).expect(200);
    expect(priorities.body.groups.map((group: any) => group.label)).toEqual([
      'Highest',
      'High',
      'Low',
    ]);

    await authedRequest()
      .patch(`/api/v1/boards/${boardId}`)
      .send({ config: { swimlaneField: 'epic' } })
      .expect(200);
    const epics = await authedRequest().get(`/api/v1/boards/${boardId}/issues`).expect(200);
    expect(epics.body.groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: epicId, label: 'Authentication epic' }),
        expect.objectContaining({ value: null, label: 'No epic' }),
      ]),
    );
  });
});
