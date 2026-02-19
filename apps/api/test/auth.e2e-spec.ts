import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TenantConnectionProvider } from '../src/core/tenant';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let connections: TenantConnectionProvider;
  let accessToken: string;
  let refreshToken: string;

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
      expect(res.body.tenant.slug).toBe('auth-test-org');
      expect(res.body.tenant.schemaName).toBe('tenant_auth_test_org');

      accessToken = res.body.accessToken;
      refreshToken = res.body.refreshToken;
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
    it('should issue a new access token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);

      expect(res.body.accessToken).toBeDefined();
      expect(typeof res.body.accessToken).toBe('string');
      expect(res.body.accessToken.split('.').length).toBe(3);
    });
  });
});
