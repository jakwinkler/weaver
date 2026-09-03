import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { TenantConnectionProvider } from '../src/core/tenant';

const doc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

describe('Project wiki (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let connections: TenantConnectionProvider;
  let tenantId: string;
  let ownerToken: string;
  let memberToken: string;
  let viewerToken: string;

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
        email: 'wiki-owner@test.com',
        password: 'password123',
        displayName: 'Wiki Owner',
        orgName: 'Wiki Test Org',
        orgSlug: 'wiki-test-org',
      })
      .expect(201);

    ownerToken = registration.body.accessToken;
    tenantId = registration.body.tenantId;

    const passwordHash = await bcrypt.hash('password123', 10);
    for (const role of ['member', 'viewer'] as const) {
      const email = `wiki-${role}@test.com`;
      const [user] = await dataSource.query(
        `INSERT INTO public.users
          (id, email, display_name, password_hash, auth_provider, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, 'local', NOW(), NOW())
         RETURNING id`,
        [email, `Wiki ${role}`, passwordHash],
      );
      await dataSource.query(
        `INSERT INTO public.tenant_memberships (tenant_id, user_id, role, created_at)
         VALUES ($1, $2, $3, NOW())`,
        [tenantId, user.id, role],
      );

      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: 'password123' })
        .expect(201);
      if (role === 'member') memberToken = login.body.accessToken;
      else viewerToken = login.body.accessToken;
    }

    await as(ownerToken)
      .post('/api/v1/projects')
      .send({ name: 'Wiki Project', key: 'WIKI' })
      .expect(201);
    for (const role of ['member', 'viewer']) {
      const [user] = await dataSource.query('SELECT id FROM public.users WHERE email = $1', [`wiki-${role}@test.com`]);
      await as(ownerToken).post('/api/v1/projects/WIKI/members').send({ userId: user.id, role }).expect(201);
    }
  });

  afterAll(async () => {
    await dataSource.query('DROP SCHEMA IF EXISTS "tenant_wiki_test_org" CASCADE');
    await dataSource.query(
      `DELETE FROM public.tenant_memberships
       WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug = 'wiki-test-org')`,
    );
    await dataSource.query(
      `DELETE FROM public.installed_plugins
       WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug = 'wiki-test-org')`,
    );
    await dataSource.query(`DELETE FROM public.tenants WHERE slug = 'wiki-test-org'`);
    await dataSource.query(
      `DELETE FROM public.users
       WHERE email IN ('wiki-owner@test.com', 'wiki-member@test.com', 'wiki-viewer@test.com')`,
    );
    await connections.closeAll();
    await app.close();
  });

  const as = (token: string) => ({
    get: (url: string) => request(app.getHttpServer()).get(url)
      .set('Authorization', `Bearer ${token}`).set('X-Tenant-ID', tenantId),
    post: (url: string) => request(app.getHttpServer()).post(url)
      .set('Authorization', `Bearer ${token}`).set('X-Tenant-ID', tenantId),
    patch: (url: string) => request(app.getHttpServer()).patch(url)
      .set('Authorization', `Bearer ${token}`).set('X-Tenant-ID', tenantId),
    delete: (url: string) => request(app.getHttpServer()).delete(url)
      .set('Authorization', `Bearer ${token}`).set('X-Tenant-ID', tenantId),
  });

  it('creates, lists, reads, updates, and deletes pages', async () => {
    const created = await as(ownerToken)
      .post('/api/v1/projects/WIKI/pages')
      .send({ title: 'Product handbook', body: doc('Welcome to the handbook') })
      .expect(201);

    expect(created.body).toMatchObject({
      title: 'Product handbook',
      slug: 'product-handbook',
      parentId: null,
      sortOrder: 0,
    });

    const list = await as(ownerToken)
      .get('/api/v1/projects/WIKI/pages')
      .expect(200);
    expect(list.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: created.body.id, slug: 'product-handbook' }),
    ]));

    await as(ownerToken)
      .get('/api/v1/projects/WIKI/pages/product-handbook')
      .expect(200)
      .expect(({ body }) => expect(body.body).toEqual(doc('Welcome to the handbook')));

    const updated = await as(ownerToken)
      .patch('/api/v1/projects/WIKI/pages/product-handbook')
      .send({ title: 'Team handbook', body: doc('Updated handbook') })
      .expect(200);
    expect(updated.body.slug).toBe('team-handbook');

    await as(ownerToken)
      .delete('/api/v1/projects/WIKI/pages/team-handbook')
      .expect(204);
    await as(ownerToken)
      .get('/api/v1/projects/WIKI/pages/team-handbook')
      .expect(404);
  });

  it('builds a nested tree, supports reparenting, and reassigns children on delete', async () => {
    const parent = await as(ownerToken)
      .post('/api/v1/projects/WIKI/pages')
      .send({ title: 'Engineering', body: doc('Engineering knowledge') })
      .expect(201);
    const secondParent = await as(ownerToken)
      .post('/api/v1/projects/WIKI/pages')
      .send({ title: 'Product', body: doc('Product knowledge') })
      .expect(201);
    const child = await as(ownerToken)
      .post('/api/v1/projects/WIKI/pages')
      .send({ title: 'Deployments', parentId: parent.body.id, body: doc('Deployment runbook') })
      .expect(201);

    const tree = await as(ownerToken)
      .get('/api/v1/projects/WIKI/pages/tree')
      .expect(200);
    const engineering = tree.body.find((page: any) => page.id === parent.body.id);
    expect(engineering.children).toEqual([
      expect.objectContaining({ id: child.body.id, title: 'Deployments' }),
    ]);

    await as(ownerToken)
      .patch('/api/v1/projects/WIKI/pages/deployments')
      .send({ parentId: secondParent.body.id, sortOrder: 2000 })
      .expect(200);

    const movedTree = await as(ownerToken)
      .get('/api/v1/projects/WIKI/pages/tree')
      .expect(200);
    expect(movedTree.body.find((page: any) => page.id === secondParent.body.id).children)
      .toEqual([expect.objectContaining({ id: child.body.id, sortOrder: 2000 })]);

    await as(ownerToken)
      .delete('/api/v1/projects/WIKI/pages/product')
      .expect(204);
    const reassigned = await as(ownerToken)
      .get('/api/v1/projects/WIKI/pages/deployments')
      .expect(200);
    expect(reassigned.body.parentId).toBeNull();
  });

  it('searches page titles and rich-text body content', async () => {
    await as(ownerToken)
      .post('/api/v1/projects/WIKI/pages')
      .send({ title: 'Incident response', body: doc('Escalate to the on-call engineer') })
      .expect(201);

    const byTitle = await as(ownerToken)
      .get('/api/v1/projects/WIKI/pages/search?q=incident')
      .expect(200);
    expect(byTitle.body).toEqual([
      expect.objectContaining({ slug: 'incident-response' }),
    ]);

    const byBody = await as(ownerToken)
      .get('/api/v1/projects/WIKI/pages/search?q=on-call')
      .expect(200);
    expect(byBody.body).toEqual([
      expect.objectContaining({ slug: 'incident-response' }),
    ]);
  });

  it('stores every previous version and can restore one', async () => {
    const created = await as(ownerToken)
      .post('/api/v1/projects/WIKI/pages')
      .send({ title: 'Versioned page', body: doc('Version zero') })
      .expect(201);

    for (const text of ['Version one', 'Version two', 'Version three']) {
      await as(ownerToken)
        .patch('/api/v1/projects/WIKI/pages/versioned-page')
        .send({ body: doc(text) })
        .expect(200);
    }

    const history = await as(ownerToken)
      .get('/api/v1/projects/WIKI/pages/versioned-page/history')
      .expect(200);
    expect(history.body).toHaveLength(3);
    expect(history.body[0]).toMatchObject({
      pageId: created.body.id,
      body: doc('Version two'),
      authorDisplayName: 'Wiki Owner',
    });

    await as(ownerToken)
      .post(`/api/v1/projects/WIKI/pages/versioned-page/history/${history.body[2].id}/restore`)
      .expect(201)
      .expect(({ body }) => expect(body.body).toEqual(doc('Version zero')));
  });

  it('allows viewers to read, blocks viewer writes, and allows member writes', async () => {
    await as(viewerToken).get('/api/v1/projects/WIKI/pages').expect(200);
    await as(viewerToken)
      .post('/api/v1/projects/WIKI/pages')
      .send({ title: 'Viewer page', body: doc('No write access') })
      .expect(403);

    const memberPage = await as(memberToken)
      .post('/api/v1/projects/WIKI/pages')
      .send({ title: 'Member page', body: doc('Member write access') })
      .expect(201);
    await as(memberToken)
      .patch('/api/v1/projects/WIKI/pages/member-page')
      .send({ body: doc('Member updated') })
      .expect(200);
    await as(viewerToken)
      .get(`/api/v1/projects/WIKI/pages/${memberPage.body.slug}`)
      .expect(200);
  });
});
