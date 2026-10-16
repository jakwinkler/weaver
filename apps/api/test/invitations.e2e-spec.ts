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
  const pendingEmail = `invitation-pending-${suffix}@example.invalid`;
  const revokedEmail = `invitation-revoked-${suffix}@example.invalid`;
  const replacedEmail = `invitation-replaced-${suffix}@example.invalid`;
  const viewerEmail = `invitation-viewer-${suffix}@example.invalid`;
  const otherOwnerEmail = `invitation-other-owner-${suffix}@example.invalid`;
  const otherSlug = `invitation-other-${suffix}`;
  let app: INestApplication;
  let dataSource: DataSource;
  let connections: TenantConnectionProvider;
  let tenantId: string;
  let accessToken: string;
  let otherTenantId: string;
  let otherAccessToken: string;

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
    const other = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: otherOwnerEmail,
        password: 'password-123',
        displayName: 'Other Owner',
        orgName: 'Other Invitation Test',
        orgSlug: otherSlug,
      })
      .expect(201);
    otherTenantId = other.body.tenantId;
    otherAccessToken = other.body.accessToken;
  });

  afterAll(async () => {
    if (tenantId) {
      await dataSource.query(`DROP SCHEMA IF EXISTS "tenant_${slug.replace(/-/g, '_')}" CASCADE`);
      await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
    }
    if (otherTenantId) {
      await dataSource.query(`DROP SCHEMA IF EXISTS "tenant_${otherSlug.replace(/-/g, '_')}" CASCADE`);
      await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [otherTenantId]);
    }
    await dataSource.query('DELETE FROM public.users WHERE email = ANY($1)', [
      [ownerEmail, memberEmail, expiredEmail, pendingEmail, revokedEmail, replacedEmail, viewerEmail, otherOwnerEmail],
    ]);
    await connections.closeAll();
    await app.close();
  });

  async function invite(email: string, role: 'member' | 'viewer' = 'member') {
    return request(app.getHttpServer())
      .post('/api/v1/users/invitations')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Tenant-ID', tenantId)
      .send({ email, role })
      .expect(201);
  }

  function asAdmin(method: 'get' | 'delete', url: string, token = accessToken, tenant = tenantId) {
    return request(app.getHttpServer())[method](url)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Tenant-ID', tenant);
  }

  const lookup = (token: string) => request(app.getHttpServer()).get(`/api/v1/auth/invitations/${token}`);

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
  it('lists pending invitations to admins without tokens', async () => {
    const created = await invite(pendingEmail, 'viewer');
    const listed = await asAdmin('get', '/api/v1/users/invitations').expect(200);
    const entry = listed.body.find((invitation: { email: string }) => invitation.email === pendingEmail);
    expect(entry).toEqual({
      id: created.body.id,
      email: pendingEmail,
      role: 'viewer',
      expiresAt: created.body.expiresAt,
      createdAt: expect.any(String),
    });
    const emails = listed.body.map((invitation: { email: string }) => invitation.email);
    expect(emails).not.toContain(expiredEmail);
    expect(JSON.stringify(listed.body)).not.toMatch(/token/i);
    expect(JSON.stringify(listed.body)).not.toContain(created.body.token);

    const otherList = await asAdmin('get', '/api/v1/users/invitations', otherAccessToken, otherTenantId).expect(200);
    expect(otherList.body).toEqual([]);
  });

  it('keeps invitation management to admins', async () => {
    const created = await invite(viewerEmail, 'viewer');
    const accepted = await request(app.getHttpServer())
      .post(`/api/v1/auth/invitations/${created.body.token}/accept`)
      .send({ email: viewerEmail, displayName: 'Invited Viewer', password: 'password-123' })
      .expect(201);
    await asAdmin('get', '/api/v1/users/invitations', accepted.body.accessToken).expect(403);
    await asAdmin('delete', `/api/v1/users/invitations/${created.body.id}`, accepted.body.accessToken).expect(403);
    const listed = await asAdmin('get', '/api/v1/users/invitations').expect(200);
    expect(listed.body.map((invitation: { email: string }) => invitation.email)).not.toContain(viewerEmail);
  });

  it('revokes a pending invitation so its link behaves like an unknown one', async () => {
    const created = await invite(revokedEmail);
    await lookup(created.body.token).expect(200);
    await asAdmin('delete', `/api/v1/users/invitations/${created.body.id}`, otherAccessToken, otherTenantId).expect(404);
    await asAdmin('delete', `/api/v1/users/invitations/${created.body.id}`).expect(204);

    const unknown = await lookup('0'.repeat(64)).expect(401);
    const revoked = await lookup(created.body.token).expect(401);
    expect(revoked.body).toEqual(unknown.body);
    await request(app.getHttpServer())
      .post(`/api/v1/auth/invitations/${created.body.token}/accept`)
      .send({ email: revokedEmail, displayName: 'Revoked', password: 'password-123' })
      .expect(401);
    await asAdmin('delete', `/api/v1/users/invitations/${created.body.id}`).expect(404);
    await asAdmin('delete', '/api/v1/users/invitations/not-a-uuid').expect(400);
    const listed = await asAdmin('get', '/api/v1/users/invitations').expect(200);
    expect(listed.body.map((invitation: { email: string }) => invitation.email)).not.toContain(revokedEmail);
    const users = await dataSource.query('SELECT id FROM public.users WHERE email = $1', [revokedEmail]);
    expect(users).toHaveLength(0);
  });

  it('replaces the pending invitation when the same email is invited again', async () => {
    const first = await invite(replacedEmail);
    const second = await invite(replacedEmail, 'viewer');
    await lookup(first.body.token).expect(401);
    const current = await lookup(second.body.token).expect(200);
    expect(current.body.role).toBe('viewer');
    const listed = await asAdmin('get', '/api/v1/users/invitations').expect(200);
    expect(listed.body.filter((invitation: { email: string }) => invitation.email === replacedEmail))
      .toEqual([expect.objectContaining({ id: second.body.id, role: 'viewer' })]);
  });

  it('removes accepted or expired invitations once they are 30 days old', async () => {
    const insert = (email: string, expiresAt: string, acceptedAt: string | null) => dataSource.query(
      `INSERT INTO public.organization_invitations (tenant_id, email, role, token_hash, expires_at, accepted_at)
       VALUES ($1, $2, 'member', $3, now() + $4::interval, now() + $5::interval) RETURNING id`,
      [tenantId, email, randomUUID().replace(/-/g, '').padEnd(64, '0'), expiresAt, acceptedAt],
    ).then(([row]: Array<{ id: string }>) => row.id);
    const oldExpired = await insert(`old-expired-${suffix}@example.invalid`, '-31 days', null);
    const oldAccepted = await insert(`old-accepted-${suffix}@example.invalid`, '-1 day', '-31 days');
    const recentExpired = await insert(`recent-expired-${suffix}@example.invalid`, '-29 days', null);
    const recentAccepted = await insert(`recent-accepted-${suffix}@example.invalid`, '-1 day', '-29 days');

    await invite(`cleanup-trigger-${suffix}@example.invalid`);

    const remaining = await dataSource.query(
      'SELECT id FROM public.organization_invitations WHERE id = ANY($1)',
      [[oldExpired, oldAccepted, recentExpired, recentAccepted]],
    );
    expect(remaining.map((row: { id: string }) => row.id).sort()).toEqual([recentExpired, recentAccepted].sort());
  });
});
