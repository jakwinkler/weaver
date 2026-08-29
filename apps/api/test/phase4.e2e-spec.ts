import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TenantConnectionProvider } from '../src/core/tenant';

describe('Phase 4: Plugin System (e2e)', () => {
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
        email: 'p4-test@example.com',
        password: 'password123',
        displayName: 'Phase4 Tester',
        orgName: 'P4 Test Org',
        orgSlug: 'p4-test-org',
      });

    accessToken = res.body.accessToken;
    tenantId = res.body.tenantId;
  });

  afterAll(async () => {
    await dataSource.query(`DROP SCHEMA IF EXISTS "tenant_p4_test_org" CASCADE`);
    await dataSource.query(`DELETE FROM public.tenant_memberships WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug = 'p4-test-org')`);
    await dataSource.query(`DELETE FROM public.installed_plugins WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug = 'p4-test-org')`);
    await dataSource.query(`DELETE FROM public.tenants WHERE slug = 'p4-test-org'`);
    await dataSource.query(`DELETE FROM public.users WHERE email = 'p4-test@example.com'`);
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

  describe('Plugin Management', () => {
    it('GET /plugins/available - should list available plugins', async () => {
      const res = await authedRequest().get('/api/v1/plugins/available').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      // Plugins may or may not be available depending on whether the plugins dir exists
    });

    it('GET /plugins - should list installed plugins (empty initially)', async () => {
      const res = await authedRequest().get('/api/v1/plugins').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(0);
    });
  });

  describe('Plugin Lifecycle', () => {
    // These tests use the actual plugins directory if plugins are loaded
    it('GET /plugins/available - should return plugin manifests', async () => {
      const res = await authedRequest().get('/api/v1/plugins/available').expect(200);
      expect(Array.isArray(res.body)).toBe(true);

      // If plugins are available, verify manifest structure
      if (res.body.length > 0) {
        const manifest = res.body[0];
        expect(manifest.id).toBeDefined();
        expect(manifest.name).toBeDefined();
        expect(manifest.version).toBeDefined();
        expect(manifest.permissions).toBeDefined();
      }
    });

    it('POST /plugins/:id/install - should return 404 for unknown plugin', async () => {
      await authedRequest()
        .post('/api/v1/plugins/non-existent-plugin/install')
        .expect(404);
    });

    it('POST /plugins/:id/enable - should return 404 for uninstalled plugin', async () => {
      await authedRequest()
        .post('/api/v1/plugins/non-existent-plugin/enable')
        .expect(404);
    });

    it('POST /plugins/:id/disable - should return 404 for uninstalled plugin', async () => {
      await authedRequest()
        .post('/api/v1/plugins/non-existent-plugin/disable')
        .expect(404);
    });

    it('DELETE /plugins/:id/uninstall - should return 404 for uninstalled plugin', async () => {
      await authedRequest()
        .delete('/api/v1/plugins/non-existent-plugin/uninstall')
        .expect(404);
    });

    it('PATCH /plugins/:id/settings - should return 404 for uninstalled plugin', async () => {
      await authedRequest()
        .patch('/api/v1/plugins/non-existent-plugin/settings')
        .send({ key: 'value' })
        .expect(404);
    });
  });
});
