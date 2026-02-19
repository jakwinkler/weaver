import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TenantConnectionProvider } from '../src/core/tenant';

describe('Phase 5: Real-Time, Notifications, Webhooks, RBAC, Teams (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let connections: TenantConnectionProvider;
  let accessToken: string;
  let tenantId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    dataSource = app.get(DataSource);
    connections = app.get(TenantConnectionProvider);

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'p5-test@example.com',
        password: 'password123',
        displayName: 'Phase5 Tester',
        orgName: 'P5 Test Org',
        orgSlug: 'p5-test-org',
      });

    accessToken = res.body.accessToken;
    tenantId = res.body.tenant.id;
  });

  afterAll(async () => {
    await dataSource.query(`DROP SCHEMA IF EXISTS "tenant_p5_test_org" CASCADE`);
    await dataSource.query(`DELETE FROM public.tenant_memberships WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug = 'p5-test-org')`);
    await dataSource.query(`DELETE FROM public.installed_plugins WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug = 'p5-test-org')`);
    await dataSource.query(`DELETE FROM public.tenants WHERE slug = 'p5-test-org'`);
    await dataSource.query(`DELETE FROM public.users WHERE email = 'p5-test@example.com'`);
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
    delete: (url: string) =>
      request(app.getHttpServer())
        .delete(url)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Tenant-ID', tenantId),
  });

  describe('Notifications', () => {
    it('GET /notifications - should return empty list initially', async () => {
      const res = await authedRequest().get('/api/v1/notifications').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /notifications/unread-count - should return zero', async () => {
      const res = await authedRequest()
        .get('/api/v1/notifications/unread-count')
        .expect(200);
      expect(res.body.count).toBeDefined();
      expect(res.body.count).toBe(0);
    });

    it('POST /notifications/mark-all-read - should succeed', async () => {
      await authedRequest()
        .post('/api/v1/notifications/mark-all-read')
        .expect(204);
    });
  });

  describe('Webhooks', () => {
    let webhookId: string;

    it('POST /webhooks - should create a webhook', async () => {
      const res = await authedRequest()
        .post('/api/v1/webhooks')
        .send({
          url: 'https://example.com/webhook',
          events: ['issue.created', 'issue.updated'],
          secret: 'test-secret-123',
        })
        .expect(201);
      webhookId = res.body.id;
      expect(res.body.url).toBe('https://example.com/webhook');
      expect(res.body.events).toEqual(['issue.created', 'issue.updated']);
    });

    it('GET /webhooks - should list webhooks', async () => {
      const res = await authedRequest().get('/api/v1/webhooks').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    it('GET /webhooks/:id - should get webhook', async () => {
      const res = await authedRequest()
        .get(`/api/v1/webhooks/${webhookId}`)
        .expect(200);
      expect(res.body.id).toBe(webhookId);
    });

    it('PATCH /webhooks/:id - should update webhook', async () => {
      const res = await authedRequest()
        .patch(`/api/v1/webhooks/${webhookId}`)
        .send({ url: 'https://example.com/webhook/v2', active: false })
        .expect(200);
      expect(res.body.url).toBe('https://example.com/webhook/v2');
      expect(res.body.active).toBe(false);
    });

    it('GET /webhooks/:id/deliveries - should return empty deliveries', async () => {
      const res = await authedRequest()
        .get(`/api/v1/webhooks/${webhookId}/deliveries`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('DELETE /webhooks/:id - should delete webhook', async () => {
      await authedRequest()
        .delete(`/api/v1/webhooks/${webhookId}`)
        .expect(204);
    });
  });

  describe('Roles', () => {
    let roleId: string;

    it('GET /roles - should list default roles', async () => {
      const res = await authedRequest().get('/api/v1/roles').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('POST /roles - should create a custom role', async () => {
      const res = await authedRequest()
        .post('/api/v1/roles')
        .send({
          name: 'Developer',
          permissions: { 'issues:read': true, 'issues:write': true, 'projects:read': true },
        })
        .expect(201);
      roleId = res.body.id;
      expect(res.body.name).toBe('Developer');
      expect(res.body.isSystem).toBe(false);
    });

    it('PATCH /roles/:id - should update role', async () => {
      const res = await authedRequest()
        .patch(`/api/v1/roles/${roleId}`)
        .send({ permissions: { 'issues:read': true, 'issues:write': true, 'projects:read': true, 'projects:write': true } })
        .expect(200);
      expect(res.body.permissions['projects:write']).toBe(true);
    });

    it('DELETE /roles/:id - should delete custom role', async () => {
      await authedRequest()
        .delete(`/api/v1/roles/${roleId}`)
        .expect(204);
    });
  });

  describe('Teams', () => {
    let teamId: string;

    it('POST /teams - should create a team', async () => {
      const res = await authedRequest()
        .post('/api/v1/teams')
        .send({ name: 'Backend Team' })
        .expect(201);
      teamId = res.body.id;
      expect(res.body.name).toBe('Backend Team');
    });

    it('GET /teams - should list teams', async () => {
      const res = await authedRequest().get('/api/v1/teams').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    it('GET /teams/:id/members - should list members', async () => {
      const res = await authedRequest()
        .get(`/api/v1/teams/${teamId}/members`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('DELETE /teams/:id - should delete team', async () => {
      await authedRequest()
        .delete(`/api/v1/teams/${teamId}`)
        .expect(204);
    });
  });
});
