import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TenantConnectionProvider } from '../src/core/tenant';

describe('Roadmap (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let connections: TenantConnectionProvider;
  let accessToken: string;
  let tenantId: string;
  let epicTypeId: string;
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
        email: 'roadmap-test@example.com',
        password: 'password123',
        displayName: 'Roadmap Tester',
        orgName: 'Roadmap Test Org',
        orgSlug: 'roadmap-test-org',
      })
      .expect(201);

    accessToken = registration.body.accessToken;
    tenantId = registration.body.tenant.id;

    await authedRequest()
      .post('/api/v1/projects')
      .send({ name: 'Roadmap Project', key: 'RMP' })
      .expect(201);

    const issueTypes = await authedRequest().get('/api/v1/issue-types').expect(200);
    epicTypeId = issueTypes.body.find(
      (issueType: { slug: string }) => issueType.slug === 'epic',
    ).id;

    const workflows = await authedRequest().get('/api/v1/workflows').expect(200);
    const defaultWorkflow = workflows.body.find(
      (workflow: { isDefault: boolean }) => workflow.isDefault,
    );
    const workflow = await authedRequest()
      .get(`/api/v1/workflows/${defaultWorkflow.id}`)
      .expect(200);
    terminalStatusId = workflow.body.statuses.find(
      (status: { isTerminal: boolean }) => status.isTerminal,
    ).id;
  });

  afterAll(async () => {
    if (!dataSource || !connections || !app) return;
    await dataSource.query('DROP SCHEMA IF EXISTS "tenant_roadmap_test_org" CASCADE');
    await dataSource.query(
      "DELETE FROM public.tenant_memberships WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug = 'roadmap-test-org')",
    );
    await dataSource.query("DELETE FROM public.tenants WHERE slug = 'roadmap-test-org'");
    await dataSource.query("DELETE FROM public.users WHERE email = 'roadmap-test@example.com'");
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

  it('returns epic child counts, completion, story points, and children', async () => {
    const epic = await authedRequest()
      .post('/api/v1/projects/RMP/issues')
      .send({ summary: 'Authentication launch', issueTypeId: epicTypeId })
      .expect(201);

    const children = [];
    children.push(
      await authedRequest()
        .post('/api/v1/projects/RMP/issues')
        .send({
          summary: 'Login form',
          epicId: epic.body.id,
          storyPoints: 5,
          startDate: '2026-09-08',
          dueDate: '2026-09-20',
        })
        .expect(201),
    );
    children.push(
      await authedRequest()
        .post('/api/v1/projects/RMP/issues')
        .send({
          summary: 'Password reset',
          epicId: epic.body.id,
          storyPoints: 3,
          startDate: '2026-09-01',
          dueDate: '2026-10-02',
        })
        .expect(201),
    );
    children.push(
      await authedRequest()
        .post('/api/v1/projects/RMP/issues')
        .send({
          summary: 'Session management',
          epicId: epic.body.id,
          storyPoints: 5,
          startDate: '2026-09-12',
          dueDate: '2026-10-15',
        })
        .expect(201),
    );

    await authedRequest()
      .patch(`/api/v1/issues/${children[0].body.key}`)
      .send({ statusId: terminalStatusId })
      .expect(200);

    const response = await authedRequest().get('/api/v1/projects/RMP/epics').expect(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      id: epic.body.id,
      key: epic.body.key,
      summary: 'Authentication launch',
      childIssueCount: 3,
      completedChildCount: 1,
      totalStoryPoints: 13,
      completedStoryPoints: 5,
      startDate: '2026-09-01',
      dueDate: '2026-10-15',
    });
    expect(response.body[0].progress).toBeCloseTo(1 / 3, 4);
    expect(response.body[0].pointsProgress).toBeCloseTo(5 / 13, 4);
    expect(response.body[0].children.map((child: { summary: string }) => child.summary)).toEqual([
      'Login form',
      'Password reset',
      'Session management',
    ]);
  });

  it('derives missing dates from children and returns blocking epic dependencies', async () => {
    const sourceEpic = await authedRequest()
      .post('/api/v1/projects/RMP/issues')
      .send({
        summary: 'Platform foundation',
        issueTypeId: epicTypeId,
        startDate: '2026-08-01',
        dueDate: '2026-08-31',
      })
      .expect(201);
    const targetEpic = await authedRequest()
      .post('/api/v1/projects/RMP/issues')
      .send({ summary: 'Public launch', issueTypeId: epicTypeId })
      .expect(201);

    await authedRequest()
      .post('/api/v1/projects/RMP/issues')
      .send({
        summary: 'Launch checklist',
        epicId: targetEpic.body.id,
        startDate: '2026-11-03',
        dueDate: '2026-12-18',
      })
      .expect(201);

    await authedRequest()
      .post('/api/v1/issue-links')
      .send({
        linkType: 'blocks',
        sourceIssueId: sourceEpic.body.id,
        targetIssueId: targetEpic.body.id,
      })
      .expect(201);

    const response = await authedRequest().get('/api/v1/projects/RMP/epics').expect(200);
    const source = response.body.find((item: { id: string }) => item.id === sourceEpic.body.id);
    const target = response.body.find((item: { id: string }) => item.id === targetEpic.body.id);

    expect(source.blockingEpicIds).toEqual([targetEpic.body.id]);
    expect(target).toMatchObject({
      startDate: '2026-11-03',
      dueDate: '2026-12-18',
    });
  });
});
