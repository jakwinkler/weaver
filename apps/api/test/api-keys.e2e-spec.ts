import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TenantConnectionProvider } from '../src/core/tenant';

describe('API keys (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let connections: TenantConnectionProvider;
  let accessToken: string;
  let tenantId: string;

  jest.setTimeout(60_000);

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
        email: 'api-keys-test@example.com',
        password: 'password123',
        displayName: 'API Keys Test User',
        orgName: 'API Keys Test Org',
        orgSlug: 'api-keys-test-org',
      })
      .expect(201);

    accessToken = registration.body.accessToken;
    tenantId = registration.body.tenantId;
  });

  afterAll(async () => {
    if (dataSource) {
      await dataSource.query(`DROP SCHEMA IF EXISTS "tenant_api_keys_test_org" CASCADE`);
      await dataSource.query(
        `DELETE FROM public.tenant_memberships
         WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug = 'api-keys-test-org')`,
      );
      await dataSource.query(`DELETE FROM public.tenants WHERE slug = 'api-keys-test-org'`);
      await dataSource.query(`DELETE FROM public.users WHERE email = 'api-keys-test@example.com'`);
    }
    await connections?.closeAll();
    await app?.close();
  });

  function asUser() {
    return {
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
      delete: (url: string) =>
        request(app.getHttpServer())
          .delete(url)
          .set('Authorization', `Bearer ${accessToken}`)
          .set('X-Tenant-ID', tenantId),
    };
  }

  async function createKey(
    name: string,
    scopes: Array<'read' | 'write' | 'admin'>,
    expiresAt?: string | null,
  ) {
    const response = await asUser()
      .post('/api/v1/api-keys')
      .send({ name, scopes, expiresAt })
      .expect(201);

    return response.body;
  }

  it('creates a key, stores only its hash, and never returns it from the list', async () => {
    const created = await createKey('CI read key', ['read']);

    expect(created.key).toMatch(/^wvr_[A-Za-z0-9_-]{40}$/);
    expect(created.name).toBe('CI read key');
    expect(created.scopes).toEqual(['read']);
    expect(created.keyHash).toBeUndefined();

    const [stored] = await dataSource.query(`SELECT key_hash FROM public.api_keys WHERE id = $1`, [
      created.id,
    ]);
    expect(stored.key_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.key_hash).not.toBe(created.key);

    const list = await asUser().get('/api/v1/api-keys').expect(200);
    const listed = list.body.find((key: { id: string }) => key.id === created.id);

    expect(listed).toMatchObject({
      name: 'CI read key',
      scopes: ['read'],
    });
    expect(listed.maskedKey).toMatch(/^wvr_/);
    expect(listed.key).toBeUndefined();
    expect(listed.keyHash).toBeUndefined();
  });

  it('authenticates the associated user and tenant and tracks last use', async () => {
    const created = await createKey('Automation key', ['read']);

    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${created.key}`)
      .expect(200);
    expect(me.body.email).toBe('api-keys-test@example.com');

    const [afterFirstUse] = await dataSource.query(
      `SELECT last_used_at FROM public.api_keys WHERE id = $1`,
      [created.id],
    );
    expect(afterFirstUse.last_used_at).toBeTruthy();

    await request(app.getHttpServer())
      .get('/api/v1/projects')
      .set('Authorization', `Bearer ${created.key}`)
      .expect(200);

    const [afterSecondUse] = await dataSource.query(
      `SELECT last_used_at FROM public.api_keys WHERE id = $1`,
      [created.id],
    );
    expect(afterSecondUse.last_used_at.getTime()).toBe(afterFirstUse.last_used_at.getTime());

    const list = await asUser().get('/api/v1/api-keys').expect(200);
    const listed = list.body.find((key: { id: string }) => key.id === created.id);
    expect(listed.lastUsedAt).toBeTruthy();
  });

  it('rejects write operations for read-only keys', async () => {
    const created = await createKey('Read-only key', ['read']);

    await request(app.getHttpServer())
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${created.key}`)
      .send({ name: 'Should not exist', key: 'NOPE' })
      .expect(403);
  });

  it('allows write operations with the write scope', async () => {
    const created = await createKey('Write key', ['write']);

    const project = await request(app.getHttpServer())
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${created.key}`)
      .send({ name: 'API-created project', key: 'API' })
      .expect(201);

    expect(project.body.key).toBe('API');
  });

  it('requires the admin scope for administrator endpoints', async () => {
    const created = await createKey('Non-admin key', ['read']);

    await request(app.getHttpServer())
      .get('/api/v1/settings')
      .set('Authorization', `Bearer ${created.key}`)
      .expect(403);
  });

  it('does not exchange an API key for an unrestricted JWT', async () => {
    const created = await createKey('Refresh attempt key', ['write']);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Authorization', `Bearer ${created.key}`)
      .expect(401);
  });

  it('rejects expired keys', async () => {
    const created = await createKey('Expired key', ['read'], '2020-01-01T00:00:00.000Z');

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${created.key}`)
      .expect(401);
  });

  it('rejects a key after it is deleted', async () => {
    const created = await createKey('Disposable key', ['read']);

    await asUser().delete(`/api/v1/api-keys/${created.id}`).expect(204);

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${created.key}`)
      .expect(401);
  });

  it('rate limits each API key to 100 requests per minute', async () => {
    const created = await createKey('Rate-limited key', ['read']);

    for (let requestNumber = 1; requestNumber <= 100; requestNumber += 1) {
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${created.key}`)
        .expect(200);
    }

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${created.key}`)
      .expect(429);
  });
});
