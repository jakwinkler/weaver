import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TenantConnectionProvider } from '../src/core/tenant';

describe('Phase 3: Custom Fields, Search, Saved Filters, Time Tracking (e2e)', () => {
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
        email: 'p3-test@example.com',
        password: 'password123',
        displayName: 'Phase3 Tester',
        orgName: 'P3 Test Org',
        orgSlug: 'p3-test-org',
      });

    accessToken = res.body.accessToken;
    tenantId = res.body.tenant.id;
  });

  afterAll(async () => {
    await dataSource.query(`DROP SCHEMA IF EXISTS "tenant_p3_test_org" CASCADE`);
    await dataSource.query(`DELETE FROM public.tenant_memberships WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug = 'p3-test-org')`);
    await dataSource.query(`DELETE FROM public.tenants WHERE slug = 'p3-test-org'`);
    await dataSource.query(`DELETE FROM public.users WHERE email = 'p3-test@example.com'`);
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

  describe('Custom Fields', () => {
    let fieldId: string;

    it('POST /custom-fields - should create a text field', async () => {
      const res = await authedRequest()
        .post('/api/v1/custom-fields')
        .send({ name: 'Environment', slug: 'environment', fieldType: 'select', options: { choices: ['staging', 'production'] } })
        .expect(201);
      fieldId = res.body.id;
      expect(res.body.name).toBe('Environment');
      expect(res.body.fieldType).toBe('select');
    });

    it('POST /custom-fields - should create a number field', async () => {
      const res = await authedRequest()
        .post('/api/v1/custom-fields')
        .send({ name: 'Story Points', slug: 'story-points', fieldType: 'number', required: false })
        .expect(201);
      expect(res.body.fieldType).toBe('number');
    });

    it('GET /custom-fields - should list custom fields', async () => {
      const res = await authedRequest().get('/api/v1/custom-fields').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);
    });

    it('PATCH /custom-fields/:id - should update field', async () => {
      const res = await authedRequest()
        .patch(`/api/v1/custom-fields/${fieldId}`)
        .send({ name: 'Deploy Environment' })
        .expect(200);
      expect(res.body.name).toBe('Deploy Environment');
    });

    it('DELETE /custom-fields/:id - should delete field', async () => {
      await authedRequest().delete(`/api/v1/custom-fields/${fieldId}`).expect(204);
      const res = await authedRequest().get('/api/v1/custom-fields').expect(200);
      expect(res.body.length).toBe(1);
    });
  });

  describe('Saved Filters', () => {
    let filterId: string;

    it('POST /saved-filters - should create a filter', async () => {
      const res = await authedRequest()
        .post('/api/v1/saved-filters')
        .send({ name: 'My Bugs', query: 'priority = "high" AND label = "bug"' })
        .expect(201);
      filterId = res.body.id;
      expect(res.body.name).toBe('My Bugs');
    });

    it('GET /saved-filters - should list filters', async () => {
      const res = await authedRequest().get('/api/v1/saved-filters').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    it('PATCH /saved-filters/:id - should update filter', async () => {
      const res = await authedRequest()
        .patch(`/api/v1/saved-filters/${filterId}`)
        .send({ name: 'Critical Bugs', isShared: true })
        .expect(200);
      expect(res.body.name).toBe('Critical Bugs');
      expect(res.body.isShared).toBe(true);
    });

    it('DELETE /saved-filters/:id - should delete filter', async () => {
      await authedRequest().delete(`/api/v1/saved-filters/${filterId}`).expect(204);
    });
  });

  describe('Time Tracking', () => {
    let projectKey: string;
    let issueKey: string;
    let entryId: string;

    beforeAll(async () => {
      const proj = await authedRequest()
        .post('/api/v1/projects')
        .send({ name: 'Time Test', key: 'TME' })
        .expect(201);
      projectKey = proj.body.key;

      const issue = await authedRequest()
        .post(`/api/v1/projects/${projectKey}/issues`)
        .send({ summary: 'Track time' })
        .expect(201);
      issueKey = issue.body.key;
    });

    it('POST /issues/:key/time-entries - should log time', async () => {
      const res = await authedRequest()
        .post(`/api/v1/issues/${issueKey}/time-entries`)
        .send({ minutes: 120, description: 'Backend work' })
        .expect(201);
      entryId = res.body.id;
      expect(res.body.minutes).toBe(120);
    });

    it('POST - should log more time', async () => {
      await authedRequest()
        .post(`/api/v1/issues/${issueKey}/time-entries`)
        .send({ minutes: 60 })
        .expect(201);
    });

    it('GET /issues/:key/time-entries - should list entries', async () => {
      const res = await authedRequest()
        .get(`/api/v1/issues/${issueKey}/time-entries`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);
    });

    it('GET /issues/:key/time-entries/summary - should return total', async () => {
      const res = await authedRequest()
        .get(`/api/v1/issues/${issueKey}/time-entries/summary`)
        .expect(200);
      expect(res.body.totalMinutes).toBe(180);
    });

    it('PATCH /issues/:key/time-entries/:id - should update entry', async () => {
      const res = await authedRequest()
        .patch(`/api/v1/issues/${issueKey}/time-entries/${entryId}`)
        .send({ minutes: 90 })
        .expect(200);
      expect(res.body.minutes).toBe(90);
    });

    it('DELETE /issues/:key/time-entries/:id - should delete entry', async () => {
      await authedRequest()
        .delete(`/api/v1/issues/${issueKey}/time-entries/${entryId}`)
        .expect(204);
    });
  });

  describe('Search', () => {
    it('POST /search - should search issues by priority', async () => {
      const res = await authedRequest()
        .post('/api/v1/search')
        .send({ query: 'priority = "medium"' })
        .expect(201);
      expect(res.body.data).toBeDefined();
      expect(res.body.total).toBeDefined();
    });

    it('POST /search - should search by summary', async () => {
      const res = await authedRequest()
        .post('/api/v1/search')
        .send({ query: 'summary ~ "Track"' })
        .expect(201);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });
});
