import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { RecurrenceService } from '../src/modules/issues/recurrence.service';
import { TenantConnectionProvider, tenantStorage } from '../src/core/tenant';

describe('Recurring tasks (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let connections: TenantConnectionProvider;
  let recurrenceService: RecurrenceService;
  let accessToken: string;
  let tenantId: string;
  let recurringIssue: Record<string, any>;

  const schemaName = 'tenant_recurring_tasks_test';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    dataSource = app.get(DataSource);
    connections = app.get(TenantConnectionProvider);
    recurrenceService = app.get(RecurrenceService);

    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'recurring-tasks@example.com',
        password: 'password123',
        displayName: 'Recurring Tasks Tester',
        orgName: 'Recurring Tasks Test',
        orgSlug: 'recurring-tasks-test',
      })
      .expect(201);

    accessToken = registration.body.accessToken;
    tenantId = registration.body.tenantId;

    await authedRequest()
      .post('/api/v1/projects')
      .send({ name: 'Recurring Project', key: 'REC' })
      .expect(201);
  });

  afterAll(async () => {
    await connections.closeAll();
    await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await dataSource.query(
      `DELETE FROM public.tenant_memberships WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug = 'recurring-tasks-test')`,
    );
    await dataSource.query(`DELETE FROM public.tenants WHERE slug = 'recurring-tasks-test'`);
    await dataSource.query(`DELETE FROM public.users WHERE email = 'recurring-tasks@example.com'`);
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

  const runScheduler = (through: string) =>
    tenantStorage.run({ tenantId, schemaName }, () =>
      recurrenceService.processDueRecurrences(new Date(`${through}T00:00:00.000Z`)),
    );

  it('stores a validated weekly recurrence rule on issue creation', async () => {
    const response = await authedRequest()
      .post('/api/v1/projects/REC/issues')
      .send({
        summary: 'Weekly team review',
        priority: 'high',
        labels: ['ceremony'],
        startDate: '2026-08-24',
        dueDate: '2026-08-25',
        recurrenceRule: {
          frequency: 'weekly',
          interval: 1,
          daysOfWeek: [1],
          maxOccurrences: 2,
        },
      })
      .expect(201);

    recurringIssue = response.body;
    expect(response.body.recurrenceRule).toEqual({
      frequency: 'weekly',
      interval: 1,
      daysOfWeek: [1],
      maxOccurrences: 2,
    });
    expect(response.body.recurrenceParentId).toBeNull();

    await authedRequest()
      .post('/api/v1/projects/REC/issues')
      .send({
        summary: 'Invalid recurrence',
        recurrenceRule: { frequency: 'weekly', interval: 0 },
      })
      .expect(400);
  });

  it('creates a linked instance with shifted dates and exposes the chain', async () => {
    await expect(runScheduler('2026-08-31')).resolves.toHaveLength(1);

    const history = await authedRequest()
      .get(`/api/v1/issues/${recurringIssue.key}/recurrence`)
      .expect(200);

    expect(history.body).toHaveLength(2);
    expect(history.body[0].id).toBe(recurringIssue.id);
    expect(history.body[1]).toMatchObject({
      summary: 'Weekly team review',
      priority: 'high',
      labels: ['ceremony'],
      startDate: '2026-08-31',
      dueDate: '2026-09-01',
      recurrenceParentId: recurringIssue.id,
      recurrenceOccurrence: 1,
      recurrenceRule: null,
    });

    const fromInstance = await authedRequest()
      .get(`/api/v1/issues/${history.body[1].key}/recurrence`)
      .expect(200);
    expect(fromInstance.body.map((issue: any) => issue.id)).toEqual(
      history.body.map((issue: any) => issue.id),
    );
  });

  it('stops after the configured maximum number of occurrences', async () => {
    await expect(runScheduler('2026-09-07')).resolves.toHaveLength(1);
    await expect(runScheduler('2026-09-14')).resolves.toHaveLength(0);

    const history = await authedRequest()
      .get(`/api/v1/issues/${recurringIssue.key}/recurrence`)
      .expect(200);
    expect(history.body).toHaveLength(3);
    expect(history.body.map((issue: any) => issue.recurrenceOccurrence)).toEqual([0, 1, 2]);
    expect(history.body[0].recurrenceRule).toBeNull();
  });

  it('stops recurrence when the rule is cleared', async () => {
    const created = await authedRequest()
      .post('/api/v1/projects/REC/issues')
      .send({
        summary: 'Daily standup prep',
        startDate: '2026-08-29',
        recurrenceRule: { frequency: 'daily', interval: 1 },
      })
      .expect(201);

    const stopped = await authedRequest()
      .patch(`/api/v1/issues/${created.body.key}`)
      .send({ recurrenceRule: null })
      .expect(200);
    expect(stopped.body.recurrenceRule).toBeNull();

    await expect(runScheduler('2026-08-30')).resolves.toHaveLength(0);
    const history = await authedRequest()
      .get(`/api/v1/issues/${created.body.key}/recurrence`)
      .expect(200);
    expect(history.body).toHaveLength(1);
  });

  it('does not create an occurrence after the end date', async () => {
    const created = await authedRequest()
      .post('/api/v1/projects/REC/issues')
      .send({
        summary: 'Ended daily report',
        startDate: '2026-08-29',
        recurrenceRule: {
          frequency: 'daily',
          interval: 1,
          endDate: '2026-08-29',
        },
      })
      .expect(201);

    await expect(runScheduler('2026-08-30')).resolves.toHaveLength(0);
    const stopped = await authedRequest().get(`/api/v1/issues/${created.body.key}`).expect(200);
    expect(stopped.body.recurrenceRule).toBeNull();
  });
});
