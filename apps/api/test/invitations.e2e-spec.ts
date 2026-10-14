import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { TenantConnectionProvider } from '../src/core/tenant';

describe('Organization invitations (e2e)', () => {
  const suffix = Math.random().toString(36).slice(2, 10);
  const slug = `invitation-test-${suffix}`;
  const ownerEmail = `invitation-owner-${suffix}@example.invalid`;
  const memberEmail = `invitation-member-${suffix}@example.invalid`;
  const expiredEmail = `invitation-expired-${suffix}@example.invalid`;
  let app: INestApplication;
  let dataSource: DataSource;
  let connections: TenantConnectionProvider;
  let tenantId: string;
  let accessToken: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    dataSource = app.get(DataSource);
    connections = app.get(TenantConnectionProvider);
    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: ownerEmail,
        password: 'password-123',
        displayName: 'Invitation Owner',
        orgName: 'Invitation Test',
        orgSlug: slug,
      })
      .expect(201);
    tenantId = registration.body.tenantId;
    accessToken = registration.body.accessToken;
  });

  afterAll(async () => {
    if (tenantId) {
      await dataSource.query(`DROP SCHEMA IF EXISTS "tenant_${slug.replace(/-/g, '_')}" CASCADE`);
      await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
      await dataSource.query('DELETE FROM public.users WHERE email = ANY($1)', [[ownerEmail, memberEmail, expiredEmail]]);
    }
    await connections.closeAll();
    await app.close();
  });

  async function invite(email: string) {
    return request(app.getHttpServer())
      .post('/api/v1/users/invitations')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Tenant-ID', tenantId)
      .send({ email, role: 'member' })
      .expect(201);
  }

  it('rejects expired invitations without creating a user', async () => {
    const created = await invite(expiredEmail);
    await dataSource.query(
      'UPDATE public.organization_invitations SET expires_at = now() - interval \'1 minute\' WHERE id = $1',
      [created.body.id],
    );
    await request(app.getHttpServer())
      .get(`/api/v1/auth/invitations/${created.body.token}`)
      .expect(401);
    await request(app.getHttpServer())
      .post(`/api/v1/auth/invitations/${created.body.token}/accept`)
      .send({ email: expiredEmail, displayName: 'Expired', password: 'password-123' })
      .expect(401);
    const users = await dataSource.query('SELECT id FROM public.users WHERE email = $1', [expiredEmail]);
    expect(users).toHaveLength(0);
  });

  it('does not invite an existing member again', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/users/invitations')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Tenant-ID', tenantId)
      .send({ email: ownerEmail.toUpperCase(), role: 'member' })
      .expect(409);
  });

  it('lists only the signed-in user organizations and rejects switching without membership', async () => {
    const organizations = await request(app.getHttpServer())
      .get('/api/v1/auth/organizations')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(organizations.body).toEqual([{
      tenantId,
      name: 'Invitation Test',
      slug,
      role: 'owner',
    }]);
    await request(app.getHttpServer())
      .post('/api/v1/auth/switch-organization')
      .send({ tenantId })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/switch-organization')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ tenantId: randomUUID() })
      .expect(401);
    const switched = await request(app.getHttpServer())
      .post('/api/v1/auth/switch-organization')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ tenantId })
      .expect(200);
    expect(switched.body.tenantId).toBe(tenantId);
  });

  it('lets exactly one concurrent redemption create the membership', async () => {
    const created = await invite(memberEmail);
    const accept = () => request(app.getHttpServer())
      .post(`/api/v1/auth/invitations/${created.body.token}/accept`)
      .send({ email: memberEmail, displayName: 'Pilot Member', password: 'password-123' });
    const responses = await Promise.all([accept(), accept()]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 401]);
    const memberships = await dataSource.query(
      `SELECT m.user_id FROM public.tenant_memberships m
       JOIN public.users u ON u.id = m.user_id
       WHERE m.tenant_id = $1 AND u.email = $2`,
      [tenantId, memberEmail],
    );
    expect(memberships).toHaveLength(1);
  });
});
