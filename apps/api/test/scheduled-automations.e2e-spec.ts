import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TenantConnectionProvider } from '../src/core/tenant';

jest.setTimeout(30_000);

describe('Scheduled automations (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let connections: TenantConnectionProvider;
  let schedulerQueue: Queue;
  let ownerToken: string;
  let ownerId: string;
  let tenantId: string;
  let projectId: string;

  beforeAll(async () => {
    process.env.AUTOMATIONS_QUEUE_NAME = 'automations-scheduled-e2e';
    process.env.SCHEDULED_AUTOMATIONS_QUEUE_NAME = 'scheduled-automations-e2e';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    dataSource = app.get(DataSource);
    connections = app.get(TenantConnectionProvider);
    schedulerQueue = new Queue(process.env.SCHEDULED_AUTOMATIONS_QUEUE_NAME, {
      connection: { host: 'localhost', port: 6380 },
    });

    const owner = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'scheduled-automation-owner@test.com',
        password: 'password123',
        displayName: 'Scheduled Automation Owner',
        orgName: 'Scheduled Automation Test Org',
        orgSlug: 'scheduled-automation-test-org',
      })
      .expect(201);
    ownerToken = owner.body.accessToken;
    ownerId = owner.body.user.id;
    tenantId = owner.body.tenant.id;

    const project = await asOwner()
      .post('/api/v1/projects')
      .send({ name: 'Scheduled Automation Project', key: 'SCHED' })
      .expect(201);
    projectId = project.body.id;
  });

  afterAll(async () => {
    if (schedulerQueue) {
      for (const scheduler of await schedulerQueue.getJobSchedulers(0, -1, true)) {
        if (scheduler.key.includes(tenantId)) {
          await schedulerQueue.removeJobScheduler(scheduler.key);
        }
      }
      await schedulerQueue.close();
    }
    if (!dataSource) return;
    await dataSource.query('DROP SCHEMA IF EXISTS "tenant_scheduled_automation_test_org" CASCADE');
    await dataSource.query(
      `DELETE FROM public.tenant_memberships
       WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug = 'scheduled-automation-test-org')`,
    );
    await dataSource.query(
      `DELETE FROM public.installed_plugins
       WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug = 'scheduled-automation-test-org')`,
    );
    await dataSource.query(
      `DELETE FROM public.tenants WHERE slug = 'scheduled-automation-test-org'`,
    );
    await dataSource.query(
      `DELETE FROM public.users WHERE email = 'scheduled-automation-owner@test.com'`,
    );
    await connections.closeAll();
    await app.close();
  });

  function asOwner() {
    const authed = (method: 'get' | 'post' | 'patch' | 'delete', url: string) =>
      request(app.getHttpServer())
        [method](url)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tenant-ID', tenantId);
    return {
      get: (url: string) => authed('get', url),
      post: (url: string) => authed('post', url),
      patch: (url: string) => authed('patch', url),
      delete: (url: string) => authed('delete', url),
    };
  }

  async function createRule(input: Record<string, unknown>) {
    return asOwner()
      .post('/api/v1/automations')
      .send({
        projectId,
        name: 'Scheduled rule',
        conditions: [],
        actions: [{ type: 'send_notification', userId: ownerId }],
        ...input,
      })
      .expect(201);
  }

  async function readExecutions(ruleId: string) {
    const response = await asOwner().get(`/api/v1/automations/${ruleId}/executions`).expect(200);
    return response.body as Array<{
      success: boolean;
      triggeredBy: { event: string; payload: Record<string, unknown> };
    }>;
  }

  async function readIssue(issueKey: string) {
    const response = await asOwner().get(`/api/v1/issues/${issueKey}`).expect(200);
    return response.body as { labels: string[] };
  }

  async function waitFor<T>(read: () => Promise<T>, predicate: (value: T) => boolean): Promise<T> {
    const deadline = Date.now() + 8_000;
    let value = await read();
    while (!predicate(value) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      value = await read();
    }
    expect(predicate(value)).toBe(true);
    return value;
  }

  it('stores named and custom schedules and registers BullMQ schedulers', async () => {
    const named = await createRule({
      name: 'Daily digest',
      trigger: { type: 'schedule', schedule: 'daily_9am' },
    });
    const custom = await createRule({
      name: 'Weekday digest',
      trigger: { type: 'schedule', cron: '0 9 * * 1-5' },
    });

    expect(named.body.trigger).toEqual({ type: 'schedule', schedule: 'daily_9am' });
    expect(custom.body.trigger).toEqual({ type: 'schedule', cron: '0 9 * * 1-5' });

    const schedulers = await schedulerQueue.getJobSchedulers(0, -1, true);
    expect(schedulers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: `weaver:automation:${tenantId}:${named.body.id}`,
          pattern: '0 9 * * *',
        }),
        expect.objectContaining({
          key: `weaver:automation:${tenantId}:${custom.body.id}`,
          pattern: '0 9 * * 1-5',
        }),
      ]),
    );

    await asOwner()
      .patch(`/api/v1/automations/${named.body.id}`)
      .send({ trigger: { type: 'schedule', schedule: 'hourly' } })
      .expect(200);
    await asOwner().delete(`/api/v1/automations/${custom.body.id}`).expect(204);

    const updatedSchedulers = await schedulerQueue.getJobSchedulers(0, -1, true);
    expect(updatedSchedulers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: `weaver:automation:${tenantId}:${named.body.id}`,
          pattern: '0 * * * *',
        }),
      ]),
    );
    expect(
      updatedSchedulers.some(
        (scheduler) => scheduler.key === `weaver:automation:${tenantId}:${custom.body.id}`,
      ),
    ).toBe(false);
  });

  it('runs an enabled schedule manually through the automation engine', async () => {
    const rule = await createRule({
      name: 'Manual scheduled notification',
      trigger: { type: 'schedule', schedule: 'hourly' },
    });

    await asOwner().post(`/api/v1/automations/${rule.body.id}/run`).expect(202, { queued: true });

    const executions = await waitFor(
      () => readExecutions(rule.body.id),
      (items) => items.length === 1,
    );
    expect(executions[0]).toMatchObject({
      success: true,
      triggeredBy: { event: 'schedule.fired' },
    });
  });

  it('runs actions once per issue matching a scheduled query condition', async () => {
    const overdue = await asOwner()
      .post('/api/v1/projects/SCHED/issues')
      .send({ summary: 'Overdue issue', dueDate: '2020-01-01' })
      .expect(201);
    const future = await asOwner()
      .post('/api/v1/projects/SCHED/issues')
      .send({ summary: 'Future issue', dueDate: '2099-01-01' })
      .expect(201);
    const rule = await createRule({
      name: 'Mark overdue issues',
      trigger: { type: 'schedule', schedule: 'daily_9am' },
      conditions: [{ type: 'query', field: 'dueDate', operator: 'before', value: 'now' }],
      actions: [{ type: 'add_label', label: 'overdue' }],
    });

    await asOwner().post(`/api/v1/automations/${rule.body.id}/run`).expect(202);

    await waitFor(
      () => readIssue(overdue.body.key),
      (issue) => issue.labels.includes('overdue'),
    );
    expect((await readIssue(future.body.key)).labels).not.toContain('overdue');

    const executions = await readExecutions(rule.body.id);
    expect(executions).toHaveLength(1);
    expect(executions[0]).toMatchObject({
      success: true,
      triggeredBy: {
        event: 'schedule.fired',
        payload: { issueKey: overdue.body.key, projectId },
      },
    });
  });
});
