import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { TenantConnectionProvider } from '../src/core/tenant';

jest.setTimeout(30_000);

describe('Automation engine (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let connections: TenantConnectionProvider;
  let ownerToken: string;
  let memberToken: string;
  let ownerId: string;
  let tenantId: string;
  let projectId: string;

  beforeAll(async () => {
    process.env.AUTOMATIONS_QUEUE_NAME = 'automations-e2e';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    dataSource = app.get(DataSource);
    connections = app.get(TenantConnectionProvider);

    const owner = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'automation-owner@test.com',
        password: 'password123',
        displayName: 'Automation Owner',
        orgName: 'Automation Test Org',
        orgSlug: 'automation-test-org',
      })
      .expect(201);

    ownerToken = owner.body.accessToken;
    ownerId = owner.body.user.id;
    tenantId = owner.body.tenant.id;

    const passwordHash = await bcrypt.hash('password123', 10);
    const [member] = await dataSource.query(
      `INSERT INTO public.users
         (email, display_name, password_hash, auth_provider, created_at, updated_at)
       VALUES ($1, $2, $3, 'local', NOW(), NOW())
       RETURNING id`,
      ['automation-member@test.com', 'Automation Member', passwordHash],
    );
    await dataSource.query(
      `INSERT INTO public.tenant_memberships (tenant_id, user_id, role, created_at)
       VALUES ($1, $2, 'member', NOW())`,
      [tenantId, member.id],
    );

    const memberLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'automation-member@test.com', password: 'password123' })
      .expect(201);
    memberToken = memberLogin.body.accessToken;

    const project = await asOwner()
      .post('/api/v1/projects')
      .send({ name: 'Automation Project', key: 'AUTO' })
      .expect(201);
    projectId = project.body.id;
  });

  afterAll(async () => {
    await dataSource.query('DROP SCHEMA IF EXISTS "tenant_automation_test_org" CASCADE');
    await dataSource.query(
      `DELETE FROM public.tenant_memberships
       WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug = 'automation-test-org')`,
    );
    await dataSource.query(
      `DELETE FROM public.installed_plugins
       WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug = 'automation-test-org')`,
    );
    await dataSource.query(`DELETE FROM public.tenants WHERE slug = 'automation-test-org'`);
    await dataSource.query(
      `DELETE FROM public.users
       WHERE email IN ('automation-owner@test.com', 'automation-member@test.com')`,
    );
    await connections.closeAll();
    await app.close();
  });

  const authedRequest = (token: string) => ({
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
    return authedRequest(ownerToken);
  }

  function asMember() {
    return authedRequest(memberToken);
  }

  async function createRule(overrides: Record<string, unknown> = {}) {
    return asOwner()
      .post('/api/v1/automations')
      .send({
        projectId,
        name: 'Test automation',
        trigger: { type: 'issue.created' },
        conditions: [],
        actions: [{ type: 'add_label', label: 'automated' }],
        ...overrides,
      })
      .expect(201);
  }

  async function createIssue(
    summary: string,
    priority: 'lowest' | 'low' | 'medium' | 'high' | 'highest' = 'medium',
  ) {
    return asOwner().post('/api/v1/projects/AUTO/issues').send({ summary, priority }).expect(201);
  }

  async function waitFor<T>(read: () => Promise<T>, predicate: (value: T) => boolean): Promise<T> {
    const deadline = Date.now() + 8000;
    let value = await read();
    while (!predicate(value) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      value = await read();
    }
    expect(predicate(value)).toBe(true);
    return value;
  }

  async function readIssue(issueKey: string) {
    const response = await asOwner().get(`/api/v1/issues/${issueKey}`).expect(200);
    return response.body;
  }

  async function readExecutions(ruleId: string) {
    const response = await asOwner().get(`/api/v1/automations/${ruleId}/executions`).expect(200);
    return response.body as Array<{ success: boolean; actionsExecuted: unknown[] }>;
  }

  it('fires matching rules and filters non-matching issues', async () => {
    const rule = await createRule({
      name: 'Urgent high-priority issues',
      conditions: [{ type: 'field_equals', field: 'priority', value: 'high' }],
      actions: [{ type: 'add_label', label: 'urgent' }],
    });

    const high = await createIssue('High-priority issue', 'high');
    const medium = await createIssue('Medium-priority issue', 'medium');

    const automated = await waitFor(
      () => readIssue(high.body.key),
      (issue) => issue.labels.includes('urgent'),
    );
    expect(automated.labels).toContain('urgent');
    expect((await readIssue(medium.body.key)).labels).not.toContain('urgent');

    const executions = await readExecutions(rule.body.id);
    expect(executions).toHaveLength(1);
    expect(executions[0]).toMatchObject({ success: true });
  });

  it('executes multiple actions in sequence', async () => {
    const rule = await createRule({
      name: 'Label and comment',
      actions: [
        { type: 'add_label', label: 'reviewed' },
        { type: 'add_comment', body: 'Automation reviewed this issue.' },
      ],
    });

    const issue = await createIssue('Multiple action issue');
    await waitFor(
      () => readIssue(issue.body.key),
      (value) => value.labels.includes('reviewed'),
    );

    const comments = await waitFor(
      async () => {
        const response = await asOwner()
          .get(`/api/v1/issues/${issue.body.key}/comments`)
          .expect(200);
        return response.body;
      },
      (value) => value.length === 1,
    );
    expect(comments[0].authorId).toBe(ownerId);

    const executions = await readExecutions(rule.body.id);
    expect(executions[0].actionsExecuted).toHaveLength(2);
  });

  it('does not execute disabled rules', async () => {
    const rule = await createRule({
      name: 'Disabled rule',
      enabled: false,
      actions: [{ type: 'add_label', label: 'should-not-appear' }],
    });

    const issue = await createIssue('Disabled rule issue');
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect((await readIssue(issue.body.key)).labels).not.toContain('should-not-appear');
    expect(await readExecutions(rule.body.id)).toHaveLength(0);
  });

  it('handles sprint events without requiring an issue', async () => {
    const rule = await createRule({
      name: 'Sprint started notification',
      trigger: { type: 'sprint.started' },
      actions: [
        {
          type: 'send_notification',
          userId: ownerId,
          title: 'Sprint started',
        },
      ],
    });
    const sprint = await asOwner()
      .post(`/api/v1/sprints?projectId=${projectId}`)
      .send({ name: 'Automation Sprint' })
      .expect(201);

    await asOwner().post(`/api/v1/sprints/${sprint.body.id}/start`).expect(201);

    const executions = await waitFor(
      () => readExecutions(rule.body.id),
      (items) => items.length === 1,
    );
    expect(executions[0]).toMatchObject({ success: true, error: null });
  });

  it('records failed executions without running later actions', async () => {
    const rule = await createRule({
      name: 'Invalid transition target',
      conditions: [
        {
          type: 'field_equals',
          field: 'summary',
          value: 'Failed execution issue',
        },
      ],
      actions: [
        {
          type: 'transition',
          statusId: '00000000-0000-4000-8000-000000000099',
        },
        { type: 'add_label', label: 'should-not-run' },
      ],
    });
    const issue = await createIssue('Failed execution issue');

    const executions = await waitFor(
      () => readExecutions(rule.body.id),
      (items) => items.length === 1,
    );
    expect(executions[0].success).toBe(false);
    expect(executions[0].actionsExecuted).toHaveLength(0);
    expect((await readIssue(issue.body.key)).labels).not.toContain('should-not-run');
  });

  it('caps chained automation execution at five levels', async () => {
    const ruleA = await createRule({
      name: 'Loop A',
      trigger: { type: 'issue.updated', field: 'summary' },
      actions: [{ type: 'set_field', field: 'priority', value: 'high' }],
    });
    const ruleB = await createRule({
      name: 'Loop B',
      trigger: { type: 'issue.updated', field: 'priority' },
      actions: [{ type: 'set_field', field: 'summary', value: 'Looped issue' }],
    });
    const issue = await createIssue('Loop seed');

    await asOwner()
      .patch(`/api/v1/issues/${issue.body.key}`)
      .send({ summary: 'Start loop' })
      .expect(200);

    await waitFor(
      async () =>
        (await readExecutions(ruleA.body.id)).length + (await readExecutions(ruleB.body.id)).length,
      (count) => count === 5,
    );
    await new Promise((resolve) => setTimeout(resolve, 400));

    const total =
      (await readExecutions(ruleA.body.id)).length + (await readExecutions(ruleB.body.id)).length;
    expect(total).toBe(5);

    await asOwner().delete(`/api/v1/automations/${ruleA.body.id}`).expect(204);
    await asOwner().delete(`/api/v1/automations/${ruleB.body.id}`).expect(204);
  });

  it('retains only the latest 100 executions per rule', async () => {
    const rule = await createRule({
      name: 'Bounded execution history',
      trigger: { type: 'issue.updated', field: 'dueDate' },
      actions: [
        {
          type: 'send_notification',
          userId: ownerId,
          title: 'Retention test',
        },
      ],
    });
    const issue = await createIssue('Execution retention issue');

    for (let index = 0; index < 105; index += 1) {
      const day = String((index % 28) + 1).padStart(2, '0');
      await asOwner()
        .patch(`/api/v1/issues/${issue.body.key}`)
        .send({ dueDate: `2026-09-${day}` })
        .expect(200);
    }

    await waitFor(
      () => readExecutions(rule.body.id),
      (executions) => executions.length === 100,
    );
    await new Promise((resolve) => setTimeout(resolve, 400));

    const [count] = await dataSource.query(
      `SELECT COUNT(*)::int AS count
       FROM "tenant_automation_test_org".automation_logs
       WHERE rule_id = $1`,
      [rule.body.id],
    );
    expect(count.count).toBe(100);
  });

  it('restricts create, update, and delete to admins', async () => {
    const rule = await createRule({ name: 'Permission rule' });

    await asMember()
      .post('/api/v1/automations')
      .send({
        name: 'Forbidden create',
        trigger: { type: 'issue.created' },
        conditions: [],
        actions: [{ type: 'add_label', label: 'forbidden' }],
      })
      .expect(403);
    await asMember()
      .patch(`/api/v1/automations/${rule.body.id}`)
      .send({ enabled: false })
      .expect(403);
    await asMember().delete(`/api/v1/automations/${rule.body.id}`).expect(403);
  });

  it('enforces workflow conditions and executes post-functions', async () => {
    const workflows = await asOwner().get('/api/v1/workflows').expect(200);
    const workflow = workflows.body.find((item: { isDefault: boolean }) => item.isDefault);
    const initialStatus = workflow.statuses.find(
      (status: { isInitial: boolean }) => status.isInitial,
    );
    const transition = workflow.transitions.find(
      (item: { fromStatusId: string }) => item.fromStatusId === initialStatus.id,
    );

    await asOwner()
      .patch(`/api/v1/workflows/${workflow.id}/transitions/${transition.id}`)
      .send({
        conditions: [{ type: 'field_equals', field: 'priority', value: 'high' }],
        postFunctions: [{ type: 'add_label', label: 'transitioned' }],
      })
      .expect(200);

    const medium = await createIssue('Condition should fail', 'medium');
    await asOwner()
      .post(`/api/v1/issues/${medium.body.key}/transition`)
      .send({ transitionId: transition.id })
      .expect(400);

    const high = await createIssue('Condition should pass', 'high');
    await asOwner()
      .post(`/api/v1/issues/${high.body.key}/transition`)
      .send({ transitionId: transition.id })
      .expect(201);
    expect((await readIssue(high.body.key)).labels).toContain('transitioned');
  });

  it('supports global CRUD and validates rule payloads', async () => {
    const created = await createRule({
      projectId: null,
      name: 'Global rule',
      trigger: { type: 'schedule', cron: '0 9 * * 1-5' },
    });

    const listed = await asOwner().get('/api/v1/automations').expect(200);
    expect(listed.body.some((rule: { id: string }) => rule.id === created.body.id)).toBe(true);

    const updated = await asOwner()
      .patch(`/api/v1/automations/${created.body.id}`)
      .send({ name: 'Updated global rule', enabled: false })
      .expect(200);
    expect(updated.body).toMatchObject({ name: 'Updated global rule', enabled: false });

    await asOwner()
      .post('/api/v1/automations')
      .send({
        name: 'Invalid rule',
        trigger: { type: 'not-a-trigger' },
        conditions: [],
        actions: [],
      })
      .expect(400);

    await asOwner().delete(`/api/v1/automations/${created.body.id}`).expect(204);
    await asOwner().get(`/api/v1/automations/${created.body.id}`).expect(404);
  });
});
