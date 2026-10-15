import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { RateLimitingGuard } from '../src/core/rate-limiting/rate-limiting.guard';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TenantConnectionProvider } from '../src/core/tenant';

describe('September session, public data, and assignee boundaries', () => {
  let app: INestApplication;
  let db: DataSource;
  let session: any;
  let foreign: any;
  let issue: any;
  const auth = (call: request.Test) =>
    call.set('Authorization', `Bearer ${session.accessToken}`).set('X-Tenant-ID', session.tenantId);
  const http = () => request(app.getHttpServer());
  beforeAll(async () => {
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    db = app.get(DataSource);
    for (const suffix of ['a', 'b']) {
      const response = await http()
        .post('/api/v1/auth/register')
        .send({
          email: `sept24-${suffix}@example.com`,
          password: 'password123',
          displayName: suffix === 'b' ? 'Foreign confidential name' : 'Review user',
          orgName: `September ${suffix}`,
          orgSlug: `sept24-${suffix}`,
        })
        .expect(201);
      if (suffix === 'a') session = response.body;
      else foreign = response.body;
    }
    await auth(http().post('/api/v1/projects'))
      .send({ key: 'REVIEW', name: 'Public Review' })
      .expect(201);
    await auth(http().patch('/api/v1/projects/REVIEW'))
      .send({ visibility: 'public', customFields: { internalSecret: 'not public' } })
      .expect(200);
    issue = (
      await auth(http().post('/api/v1/projects/REVIEW/issues'))
        .send({ summary: 'First public issue', customFields: {} })
        .expect(201)
    ).body;
    await auth(http().post('/api/v1/projects/REVIEW/issues'))
      .send({ summary: 'Second public issue' })
      .expect(201);
  }, 60000);
  afterAll(async () => {
    if (!app) return;
    await app.get(TenantConnectionProvider).closeAll();
    if (db) {
      for (const schema of ['tenant_sept24_a', 'tenant_sept24_b'])
        await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await db.query("DELETE FROM public.tenants WHERE slug IN ('sept24-a', 'sept24-b')");
      await db.query(
        "DELETE FROM public.users WHERE email IN ('sept24-a@example.com', 'sept24-b@example.com')",
      );
    }
    await app.close();
  }, 30000);

  it('bootstraps OAuth state repeatedly without minting refresh sessions or cookies', async () => {
    const before = await db.query(
      'SELECT token_hash FROM public.refresh_sessions WHERE user_id=$1',
      [session.user.id],
    );
    for (let i = 0; i < 2; i++) {
      const result = await auth(http().get('/api/v1/auth/session')).expect(200);
      expect(Object.keys(result.body).sort()).toEqual(['tenantId', 'user']);
      expect(result.body.user.role).toBe('owner');
      expect(result.headers['set-cookie']).toBeUndefined();
    }
    expect(
      await db.query('SELECT token_hash FROM public.refresh_sessions WHERE user_id=$1', [
        session.user.id,
      ]),
    ).toEqual(before);
  });

  it('paginates public boards with deterministic continuation and an explicit issue projection', async () => {
    const first = await http()
      .get('/api/v1/public/sept24-a/projects/REVIEW/board?perPage=1&page=1')
      .expect(200);
    const second = await http()
      .get('/api/v1/public/sept24-a/projects/REVIEW/board?perPage=1&page=2')
      .expect(200);
    expect(first.body.issues).toHaveLength(1);
    expect(first.body.meta).toMatchObject({ page: 1, perPage: 1, total: 2, totalPages: 2 });
    expect(second.body.issues).toHaveLength(1);
    expect(second.body.issues[0].id).not.toBe(first.body.issues[0].id);
    expect(Object.keys(first.body.issues[0]).sort()).toEqual([
      'id',
      'key',
      'priority',
      'statusId',
      'summary',
    ]);
    await http().get('/api/v1/public/sept24-a/projects/REVIEW/board?perPage=100000').expect(400);
  });

  it('does not expose private fields from sibling public endpoints', async () => {
    const project = await http().get('/api/v1/public/sept24-a/projects/REVIEW').expect(200);
    expect(Object.keys(project.body).sort()).toEqual(['description', 'id', 'key', 'name']);
    const issues = await http().get('/api/v1/public/sept24-a/projects/REVIEW/issues').expect(200);
    expect(Object.keys(issues.body.data[0]).sort()).toEqual([
      'id',
      'key',
      'priority',
      'statusId',
      'summary',
    ]);
    const projects = await http().get('/api/v1/public/sept24-a/projects').expect(200);
    expect(projects.body.data[0]).not.toHaveProperty('customFields');
  });

  it.each(['create', 'update', 'bulk'])(
    'rejects foreign-tenant assignment on %s before changing issues',
    async (mode) => {
      const before = await db.query(
        'SELECT id, summary, assignee_id FROM tenant_sept24_a.issues ORDER BY id',
      );
      const call =
        mode === 'create'
          ? auth(http().post('/api/v1/projects/REVIEW/issues')).send({
              summary: 'foreign create',
              assigneeId: foreign.user.id,
            })
          : mode === 'update'
            ? auth(http().patch(`/api/v1/issues/${issue.key}`)).send({
                summary: 'changed',
                assigneeId: foreign.user.id,
              })
            : auth(http().patch('/api/v1/issues/bulk')).send({
                issueIds: [issue.id],
                updates: { priority: 'high', assigneeId: foreign.user.id },
              });
      await call.expect(400);
      expect(
        await db.query('SELECT id, summary, assignee_id FROM tenant_sept24_a.issues ORDER BY id'),
      ).toEqual(before);
    },
  );

  it('allows tenant members and unassignment without disclosing a legacy foreign assignee', async () => {
    await db.query('UPDATE tenant_sept24_a.issues SET assignee_id=$1 WHERE id=$2', [
      foreign.user.id,
      issue.id,
    ]);
    await auth(http().patch(`/api/v1/issues/${issue.key}`))
      .send({ assigneeId: session.user.id })
      .expect(200);
    await auth(http().patch('/api/v1/issues/bulk'))
      .send({ issueIds: [issue.id], updates: { assigneeId: null } })
      .expect(200);
    const rows = await db.query('SELECT * FROM tenant_sept24_a.activity_logs');
    expect(JSON.stringify(rows)).not.toContain('Foreign confidential name');
    expect(JSON.stringify(rows)).not.toContain('sept24-b@example.com');
  });

  it('shares user and tenant socket budgets across API instances and fails closed offline', async () => {
    const config = app.get(ConfigService);
    const first = new RateLimitingGuard(new Reflector(), config, {} as never);
    const second = new RateLimitingGuard(new Reflector(), config, {} as never);
    await first.onModuleInit();
    await second.onModuleInit();
    try {
      for (let i = 0; i < 60; i++)
        expect(
          await (i % 2 ? first : second).allowProjectJoin(session.tenantId, session.user.id),
        ).toBe(true);
      expect(await second.allowProjectJoin(session.tenantId, session.user.id)).toBe(false);
      // The aggregate tenant budget also covers distinct users and sockets.
      for (let i = 60; i < 600; i++)
        expect(await first.allowProjectJoin(session.tenantId, `synthetic-${i}`)).toBe(true);
      expect(await second.allowProjectJoin(session.tenantId, 'another-user')).toBe(false);
      expect(await second.allowProjectJoin(foreign.tenantId, foreign.user.id)).toBe(true);
    } finally {
      await first.onModuleDestroy();
      await second.onModuleDestroy();
    }
    expect(await second.allowProjectJoin(foreign.tenantId, foreign.user.id)).toBe(false);
  });

  it('records the first untrusted hop behind the configured trusted proxy chain', async () => {
    const express = app.getHttpAdapter().getInstance();
    express.set('trust proxy', ['loopback', '10.0.0.0/8']);
    try {
      const project = await auth(http().post('/api/v1/projects'))
        .set('X-Forwarded-For', '203.0.113.99, 198.51.100.7, 10.0.0.5')
        .send({ key: 'PROXY', name: 'Proxy test' })
        .expect(201);
      const audit = await auth(http().get('/api/v1/audit-log?action=project.created')).expect(200);
      expect(
        audit.body.data.find(
          (entry: { resourceId: string }) => entry.resourceId === project.body.id,
        ).ipAddress,
      ).toBe('198.51.100.7');
    } finally {
      express.set('trust proxy', false);
    }
  });

  it('logout leaves no refresh session created by bootstrap', async () => {
    await auth(http().post('/api/v1/auth/logout'))
      .set('Authorization', `Bearer ${session.refreshToken}`)
      .expect(204);
    expect(
      await db.query('SELECT id FROM public.refresh_sessions WHERE user_id=$1', [session.user.id]),
    ).toEqual([]);
    await http()
      .post('/api/v1/auth/refresh')
      .set('Authorization', `Bearer ${session.refreshToken}`)
      .expect(401);
  });
});
