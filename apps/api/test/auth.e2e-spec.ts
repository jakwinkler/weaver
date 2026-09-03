import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TenantConnectionProvider } from '../src/core/tenant';

describe('Auth (e2e)', () => {
  const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  let app: INestApplication;
  let dataSource: DataSource;
  let connections: TenantConnectionProvider;
  let accessToken: string;
  let refreshToken: string;
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
  });

  afterAll(async () => {
    // Clean up test data
    await dataSource.query(`DROP SCHEMA IF EXISTS "tenant_auth_test_org" CASCADE`);
    await dataSource.query(`DELETE FROM public.tenant_memberships WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug = 'auth-test-org')`);
    await dataSource.query(`DELETE FROM public.tenants WHERE slug = 'auth-test-org'`);
    await dataSource.query(`DELETE FROM public.users WHERE email = 'auth-test@example.com'`);
    await connections.closeAll();
    await app.close();
  });

  describe('POST /api/v1/auth/register', () => {
    it('should register a new user and create a tenant', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'auth-test@example.com',
          password: 'password123',
          displayName: 'Auth Test User',
          orgName: 'Auth Test Org',
          orgSlug: 'auth-test-org',
        })
        .expect(201);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.user.email).toBe('auth-test@example.com');
      expect(res.body.user.displayName).toBe('Auth Test User');
      expect(res.body.user.passwordHash).toBeUndefined();
      expect(res.body.tenantId).toMatch(UUID_PATTERN);
      expect(res.body.tenant).toBeUndefined();

      const [tenant] = await dataSource.query(
        `SELECT slug, schema_name AS "schemaName" FROM public.tenants WHERE id = $1`,
        [res.body.tenantId],
      );
      expect(tenant).toEqual({
        slug: 'auth-test-org',
        schemaName: 'tenant_auth_test_org',
      });

      accessToken = res.body.accessToken;
      refreshToken = res.body.refreshToken;
      tenantId = res.body.tenantId;
    });

    it('should reject duplicate email', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'auth-test@example.com',
          password: 'password123',
          displayName: 'Another User',
          orgName: 'Another Org',
          orgSlug: 'another-org',
        })
        .expect(409);
    });

    it('should reject invalid registration data', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'not-an-email',
          password: '123',
          displayName: '',
          orgName: '',
          orgSlug: 'INVALID',
        })
        .expect(400);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should login with valid credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'auth-test@example.com',
          password: 'password123',
        })
        .expect(201);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.user.email).toBe('auth-test@example.com');
      expect(res.body.user.passwordHash).toBeUndefined();
      expect(res.body.tenantId).toBe(tenantId);
      expect(res.body.tenantId).toMatch(UUID_PATTERN);
      expect(res.body.tenant).toBeUndefined();

      accessToken = res.body.accessToken;
    });

    it('should reject invalid password', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'auth-test@example.com',
          password: 'wrongpassword',
        })
        .expect(401);
    });

    it('should reject non-existent email', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'nouser@example.com',
          password: 'password123',
        })
        .expect(401);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return current user with valid token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.email).toBe('auth-test@example.com');
      expect(res.body.displayName).toBe('Auth Test User');
      expect(res.body.passwordHash).toBeUndefined();
    });

    it('should reject request without token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .expect(401);
    });

    it('should reject invalid token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('rejects access tokens on the refresh endpoint', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);
    });

    it('rotates a valid refresh token and rejects reuse', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Authorization', `Bearer ${refreshToken}`)
        .expect(201);

      expect(res.body.accessToken).toBeDefined();
      expect(typeof res.body.accessToken).toBe('string');
      expect(res.body.accessToken.split('.').length).toBe(3);
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.refreshToken).not.toBe(refreshToken);

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Authorization', `Bearer ${refreshToken}`)
        .expect(401);

      refreshToken = res.body.refreshToken;
      accessToken = res.body.accessToken;
    });

    it('does not accept refresh tokens as access tokens', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${refreshToken}`)
        .expect(401);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('revokes the refresh session and clears both cookies', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${refreshToken}`)
        .expect(204);

      const cookies = res.headers['set-cookie'] as unknown as string[];
      expect(cookies.join(';')).toContain('weaver_token=;');
      expect(cookies.join(';')).toContain('weaver_refresh=;');

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Authorization', `Bearer ${refreshToken}`)
        .expect(401);
    });
  });
});
