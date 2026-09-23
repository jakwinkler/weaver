import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TenantConnectionProvider } from '../src/core/tenant';

describe('Projects & Issues (e2e)', () => {
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

    // Register a user to get auth token and tenant
    const res = await request(app.getHttpServer()).post('/api/v1/auth/register').send({
      email: 'proj-test@example.com',
      password: 'password123',
      displayName: 'Project Tester',
      orgName: 'Proj Test Org',
      orgSlug: 'proj-test-org',
    });

    accessToken = res.body.accessToken;
    tenantId = res.body.tenant.id;
  });

  afterAll(async () => {
    await dataSource.query(`DROP SCHEMA IF EXISTS "tenant_proj_test_org" CASCADE`);
    await dataSource.query(
      `DELETE FROM public.tenant_memberships WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug = 'proj-test-org')`,
    );
    await dataSource.query(`DELETE FROM public.tenants WHERE slug = 'proj-test-org'`);
    await dataSource.query(`DELETE FROM public.users WHERE email = 'proj-test@example.com'`);
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

  describe('Users', () => {
    it('GET /users/me - should return current user', async () => {
      const res = await authedRequest().get('/api/v1/users/me').expect(200);
      expect(res.body.email).toBe('proj-test@example.com');
      expect(res.body.displayName).toBe('Project Tester');
      expect(res.body.passwordHash).toBeUndefined();
    });

    it('PATCH /users/me - should update display name', async () => {
      const res = await authedRequest()
        .patch('/api/v1/users/me')
        .send({ displayName: 'Updated Name' })
        .expect(200);
      expect(res.body.displayName).toBe('Updated Name');
    });

    it('GET /users - should list org members', async () => {
      const res = await authedRequest().get('/api/v1/users').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
      expect(res.body[0].role).toBe('owner');
    });
  });

  describe('Projects CRUD', () => {
    it('POST /projects - should create a project', async () => {
      const res = await authedRequest()
        .post('/api/v1/projects')
        .send({ name: 'Web App', key: 'WEB' })
        .expect(201);

      expect(res.body.key).toBe('WEB');
      expect(res.body.name).toBe('Web App');
      expect(res.body.issueCounter).toBe(0);
      expect(res.body.id).toBeDefined();
    });

    it('POST /projects - should reject duplicate key', async () => {
      await authedRequest()
        .post('/api/v1/projects')
        .send({ name: 'Web App 2', key: 'WEB' })
        .expect(409);
    });

    it('POST /projects - should reject invalid key', async () => {
      await authedRequest()
        .post('/api/v1/projects')
        .send({ name: 'Bad Key', key: 'bad' })
        .expect(400);
    });

    it('GET /projects - should list projects', async () => {
      const res = await authedRequest().get('/api/v1/projects').expect(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.meta.total).toBe(1);
      expect(res.body.meta.page).toBe(1);
    });

    it('GET /projects/:key - should get project by key', async () => {
      const res = await authedRequest().get('/api/v1/projects/WEB').expect(200);
      expect(res.body.key).toBe('WEB');
    });

    it('GET /projects/:key - should 404 for non-existent key', async () => {
      await authedRequest().get('/api/v1/projects/NOPE').expect(404);
    });

    it('PATCH /projects/:key - should update project', async () => {
      const res = await authedRequest()
        .patch('/api/v1/projects/WEB')
        .send({ name: 'Web Application' })
        .expect(200);
      expect(res.body.name).toBe('Web Application');
    });

    it('POST /projects - should create a second project', async () => {
      const res = await authedRequest()
        .post('/api/v1/projects')
        .send({ name: 'Mobile App', key: 'MOB' })
        .expect(201);
      expect(res.body.key).toBe('MOB');
    });

    it('GET /projects - should sort by name', async () => {
      const res = await authedRequest().get('/api/v1/projects?sort=name').expect(200);
      expect(res.body.data[0].name).toBe('Mobile App');
      expect(res.body.data[1].name).toBe('Web Application');
    });

    it('GET /projects - should paginate', async () => {
      const res = await authedRequest().get('/api/v1/projects?page=1&perPage=1').expect(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.meta.total).toBe(2);
      expect(res.body.meta.totalPages).toBe(2);
    });
  });

  describe('Issues CRUD', () => {
    it('POST /projects/:key/issues - should create an issue with sequential key', async () => {
      const res = await authedRequest()
        .post('/api/v1/projects/WEB/issues')
        .send({ summary: 'First issue' })
        .expect(201);

      expect(res.body.key).toBe('WEB-1');
      expect(res.body.summary).toBe('First issue');
      expect(res.body.priority).toBe('medium');
      expect(res.body.statusId).toBeDefined();
    });

    it('should create sequential keys', async () => {
      const res2 = await authedRequest()
        .post('/api/v1/projects/WEB/issues')
        .send({ summary: 'Second issue', priority: 'high' })
        .expect(201);
      expect(res2.body.key).toBe('WEB-2');

      const res3 = await authedRequest()
        .post('/api/v1/projects/WEB/issues')
        .send({ summary: 'Third issue' })
        .expect(201);
      expect(res3.body.key).toBe('WEB-3');
    });

    it('should create issues in different projects with separate counters', async () => {
      const res = await authedRequest()
        .post('/api/v1/projects/MOB/issues')
        .send({ summary: 'Mobile issue' })
        .expect(201);
      expect(res.body.key).toBe('MOB-1');
    });

    it('GET /projects/:key/issues - should list project issues', async () => {
      const res = await authedRequest().get('/api/v1/projects/WEB/issues').expect(200);
      expect(res.body.data.length).toBe(3);
      expect(res.body.meta.total).toBe(3);
    });

    it('GET /projects/:key/issues - should paginate issues', async () => {
      const res = await authedRequest()
        .get('/api/v1/projects/WEB/issues?page=1&perPage=2')
        .expect(200);
      expect(res.body.data.length).toBe(2);
      expect(res.body.meta.totalPages).toBe(2);
    });

    it('GET /issues/:key - should get issue by key', async () => {
      const res = await authedRequest().get('/api/v1/issues/WEB-1').expect(200);
      expect(res.body.summary).toBe('First issue');
    });

    it('PATCH /issues/:key - should update issue', async () => {
      const res = await authedRequest()
        .patch('/api/v1/issues/WEB-1')
        .send({ summary: 'Updated first issue', priority: 'highest' })
        .expect(200);
      expect(res.body.summary).toBe('Updated first issue');
      expect(res.body.priority).toBe('highest');
    });

    it('PATCH /issues/:key - should persist and clear a rich-text description', async () => {
      const description = {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'Rich description', marks: [{ type: 'bold' }] }],
          },
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First item' }] }],
              },
            ],
          },
        ],
      };

      const updated = await authedRequest()
        .patch('/api/v1/issues/WEB-1')
        .send({ description })
        .expect(200);
      expect(updated.body.description).toEqual(description);

      const fetched = await authedRequest().get('/api/v1/issues/WEB-1').expect(200);
      expect(fetched.body.description).toEqual(description);

      const cleared = await authedRequest()
        .patch('/api/v1/issues/WEB-1')
        .send({ description: null })
        .expect(200);
      expect(cleared.body.description).toBeNull();
    });

    it('PATCH /issues/:key - should set labels and custom fields', async () => {
      const res = await authedRequest()
        .patch('/api/v1/issues/WEB-2')
        .send({
          labels: ['bug', 'urgent'],
          customFields: { severity: 'critical' },
        })
        .expect(200);
      expect(res.body.labels).toEqual(['bug', 'urgent']);
      expect(res.body.customFields).toEqual({ severity: 'critical' });
    });

    it('DELETE /issues/:key - should delete issue', async () => {
      await authedRequest().delete('/api/v1/issues/WEB-3').expect(204);
      await authedRequest().get('/api/v1/issues/WEB-3').expect(404);
    });

    it('should require authentication', async () => {
      await request(app.getHttpServer()).get('/api/v1/projects').expect(401);
    });
  });

  describe('Pagination & Sorting', () => {
    it('should reject invalid sort field', async () => {
      await authedRequest().get('/api/v1/projects?sort=invalid').expect(400);
    });

    it('should sort descending with - prefix', async () => {
      const res = await authedRequest().get('/api/v1/projects?sort=-name').expect(200);
      expect(res.body.data[0].name).toBe('Web Application');
    });

    it('should reject perPage > 200', async () => {
      await authedRequest().get('/api/v1/projects?perPage=201').expect(400);
    });

    it('should handle empty results', async () => {
      const res = await authedRequest().get('/api/v1/projects?page=999').expect(200);
      expect(res.body.data.length).toBe(0);
      expect(res.body.meta.total).toBe(2);
    });
  });

  describe('Validation', () => {
    it('should reject empty project name', async () => {
      await authedRequest().post('/api/v1/projects').send({ name: '', key: 'TST' }).expect(400);
    });

    it('should reject empty issue summary', async () => {
      await authedRequest().post('/api/v1/projects/WEB/issues').send({ summary: '' }).expect(400);
    });

    it('should reject invalid priority', async () => {
      await authedRequest()
        .post('/api/v1/projects/WEB/issues')
        .send({ summary: 'Test', priority: 'urgent' })
        .expect(400);
    });
  });

  describe('Project Deletion', () => {
    it('DELETE /projects/:key - should delete project after removing its issues', async () => {
      // First delete the issue in MOB project
      await authedRequest().delete('/api/v1/issues/MOB-1').expect(204);
      // Then delete the project
      await authedRequest().delete('/api/v1/projects/MOB').expect(204);
      await authedRequest().get('/api/v1/projects/MOB').expect(404);
    });
  });
});
