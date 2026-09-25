import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { TenantConnectionProvider } from '../src/core/tenant';
import { AuditService } from '../src/modules/audit';

describe('Audit Log (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let connections: TenantConnectionProvider;
  let auditService: AuditService;
  let ownerToken: string;
  let viewerToken: string;
  let tenantId: string;
  let ownerId: string;
  let viewerId: string;
  let customRoleId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    dataSource = app.get(DataSource);
    connections = app.get(TenantConnectionProvider);
    auditService = app.get(AuditService);

    const register = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'audit-owner@test.com',
        password: 'password123',
        displayName: 'Audit Owner',
        orgName: 'Audit Test Org',
        orgSlug: 'audit-test-org',
      })
      .expect(201);

    ownerToken = register.body.accessToken;
    tenantId = register.body.tenantId;
    ownerId = register.body.user.id;

    const passwordHash = await bcrypt.hash('password123', 10);
    await dataSource.query(
      `INSERT INTO public.users (id, email, display_name, password_hash, auth_provider, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'local', NOW(), NOW())`,
      ['audit-viewer@test.com', 'Audit Viewer', passwordHash],
    );
    const [viewer] = await dataSource.query(`SELECT id FROM public.users WHERE email = $1`, [
      'audit-viewer@test.com',
    ]);
    viewerId = viewer.id;
    await dataSource.query(
      `INSERT INTO public.tenant_memberships (tenant_id, user_id, role, created_at)
       VALUES ($1, $2, 'viewer', NOW())`,
      [tenantId, viewer.id],
    );

    const viewerLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'audit-viewer@test.com', password: 'password123' })
      .expect(201);
    viewerToken = viewerLogin.body.accessToken;
  });

  afterAll(async () => {
    await dataSource.query('DROP SCHEMA IF EXISTS "tenant_audit_test_org" CASCADE');
    await dataSource.query(
      `DELETE FROM public.tenant_memberships
       WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug = 'audit-test-org')`,
    );
    await dataSource.query(
      `DELETE FROM public.installed_plugins
       WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug = 'audit-test-org')`,
    );
    await dataSource.query(`DELETE FROM public.tenants WHERE slug = 'audit-test-org'`);
    await dataSource.query(
      `DELETE FROM public.users WHERE email IN ('audit-owner@test.com', 'audit-viewer@test.com')`,
    );
    await connections.closeAll();
    await app.close();
  });

  function authed(token: string) {
    return {
      get: (url: string) =>
        request(app.getHttpServer())
          .get(url)
          .set('Authorization', `Bearer ${token}`)
          .set('X-Tenant-ID', tenantId),
      post: (url: string) =>
        request(app.getHttpServer())
          .post(url)
          .set('Authorization', `Bearer ${token}`)
          .set('X-Tenant-ID', tenantId),
      patch: (url: string) =>
        request(app.getHttpServer())
          .patch(url)
          .set('Authorization', `Bearer ${token}`)
          .set('X-Tenant-ID', tenantId),
      delete: (url: string) =>
        request(app.getHttpServer())
          .delete(url)
          .set('Authorization', `Bearer ${token}`)
          .set('X-Tenant-ID', tenantId),
    };
  }

  it('creates an audit entry with actor and request details', async () => {
    const project = await authed(ownerToken)
      .post('/api/v1/projects')
      .set('X-Forwarded-For', '203.0.113.9')
      .set('User-Agent', 'Weaver Audit Test')
      .send({ name: 'Audit Project', key: 'AUD' })
      .expect((response) => {
        if (response.status !== 201) throw new Error(`Project creation failed: ${JSON.stringify(response.body)}`);
      })
      .expect(201);

    const result = await authed(ownerToken)
      .get('/api/v1/audit-log?action=project.created')
      .expect(200);

    expect(result.body.meta.total).toBe(1);
    expect(result.body.data[0]).toMatchObject({
      userId: ownerId,
      action: 'project.created',
      resource: 'project',
      resourceId: project.body.id,
      ipAddress: expect.stringMatching(/^(::ffff:)?127\.0\.0\.1$|^::1$/),
      userAgent: 'Weaver Audit Test',
    });
    expect(result.body.data[0].user).toMatchObject({
      displayName: 'Audit Owner',
      email: 'audit-owner@test.com',
    });
  });

  it('filters entries by resource and captures update state', async () => {
    const role = await authed(ownerToken)
      .post('/api/v1/roles')
      .send({ name: 'auditor', permissions: { 'projects.read': true } })
      .expect(201);
    customRoleId = role.body.id;

    await authed(ownerToken)
      .patch('/api/v1/projects/AUD')
      .send({ name: 'Renamed Audit Project' })
      .expect(200);

    const result = await authed(ownerToken)
      .get('/api/v1/audit-log?resource=project&sort=createdAt')
      .expect(200);

    expect(result.body.data).toHaveLength(2);
    expect(
      result.body.data.every((entry: { resource: string }) => entry.resource === 'project'),
    ).toBe(true);

    const update = result.body.data.find(
      (entry: { action: string }) => entry.action === 'project.updated',
    );
    expect(update.metadata.before.name).toBe('Audit Project');
    expect(update.metadata.after.name).toBe('Renamed Audit Project');
  });

  it('allows only tenant admins to query audit entries', async () => {
    await authed(viewerToken).get('/api/v1/audit-log').expect(403);
  });

  it('exports filtered audit entries as CSV', async () => {
    const result = await authed(ownerToken)
      .get('/api/v1/audit-log/export?resource=project')
      .expect(200)
      .expect('Content-Type', /text\/csv/);

    expect(result.headers['content-disposition']).toContain('attachment;');
    expect(result.text).toContain(
      'Timestamp,User,Email,Action,Resource,Resource ID,IP Address,User Agent,Details',
    );
    expect(result.text).toContain('project.created');
    expect(result.text).not.toContain('role.created');
  });

  it('logs critical admin action families and redacts secrets', async () => {
    await authed(ownerToken)
      .patch(`/api/v1/users/${viewerId}/role`)
      .send({ role: 'member' })
      .expect(200);

    await authed(ownerToken)
      .patch(`/api/v1/roles/${customRoleId}`)
      .send({ permissions: { 'projects.read': true, 'audit.read': true } })
      .expect(200);
    await authed(ownerToken).delete(`/api/v1/roles/${customRoleId}`).expect(204);

    await authed(ownerToken)
      .post('/api/v1/projects')
      .send({ name: 'Deleted Audit Project', key: 'DEL' })
      .expect(201);
    await authed(ownerToken).delete('/api/v1/projects/DEL').expect(204);

    const workflow = await authed(ownerToken)
      .post('/api/v1/workflows')
      .send({ name: 'Audited Workflow', isDefault: false })
      .expect(201);
    await authed(ownerToken)
      .patch(`/api/v1/workflows/${workflow.body.id}`)
      .send({ name: 'Renamed Audited Workflow' })
      .expect(200);

    const webhook = await authed(ownerToken)
      .post('/api/v1/webhooks')
      .send({
        url: 'https://example.com/audit-hook',
        secret: 'webhook-secret-that-must-not-leak',
        events: ['project.created'],
      })
      .expect(201);

    await authed(ownerToken)
      .patch('/api/v1/settings')
      .send({
        theme: 'dark',
        smtp: {
          host: 'smtp.example.com',
          port: 587,
          secure: false,
          user: 'audit@example.com',
          pass: 'smtp-password-that-must-not-leak',
          fromName: 'Audit Test',
          fromEmail: 'audit@example.com',
        },
      })
      .expect(200);

    const pluginId = '@weaver/plugin-timer';
    await authed(ownerToken).post('/api/v1/plugins/install').send({ pluginId }).expect(201);
    await authed(ownerToken)
      .patch('/api/v1/plugins/settings')
      .send({
        pluginId,
        settings: {
          apiKey: 'plugin-key-that-must-not-leak',
          webhookSecret: 'nested-secret-that-must-not-leak',
          gitlabToken: 'nested-token-that-must-not-leak',
        },
      })
      .expect(200);
    await authed(ownerToken).post('/api/v1/plugins/disable').send({ pluginId }).expect(201);
    await authed(ownerToken).post('/api/v1/plugins/enable').send({ pluginId }).expect(201);
    await authed(ownerToken).post('/api/v1/plugins/uninstall').send({ pluginId }).expect(204);

    await authed(ownerToken)
      .patch(`/api/v1/webhooks/${webhook.body.id}`)
      .send({ active: false })
      .expect(200);
    await authed(ownerToken).post(`/api/v1/webhooks/${webhook.body.id}/test`).expect(201);
    await authed(ownerToken).delete(`/api/v1/webhooks/${webhook.body.id}`).expect(204);
    await authed(ownerToken).delete(`/api/v1/workflows/${workflow.body.id}`).expect(204);
    await authed(ownerToken)
      .get('/api/v1/audit-log?perPage=100')
      .expect(200)
      .then((result) => {
        const actions = result.body.data.map((entry: { action: string }) => entry.action);
        expect(actions).toEqual(
          expect.arrayContaining([
            'role.created',
            'role.updated',
            'role.deleted',
            'user.role_changed',
            'project.deleted',
            'workflow.created',
            'workflow.updated',
            'workflow.deleted',
            'webhook.created',
            'webhook.updated',
            'webhook.tested',
            'webhook.deleted',
            'settings.updated',
            'plugin.installed',
            'plugin.settings_updated',
            'plugin.disabled',
            'plugin.enabled',
            'plugin.uninstalled',
          ]),
        );
        const serialized = JSON.stringify(result.body.data);
        expect(serialized).not.toContain('webhook-secret-that-must-not-leak');
        expect(serialized).not.toContain('smtp-password-that-must-not-leak');
        expect(serialized).not.toContain('plugin-key-that-must-not-leak');
        expect(serialized).not.toContain('nested-secret-that-must-not-leak');
        expect(serialized).not.toContain('nested-token-that-must-not-leak');
        expect(serialized).toContain('[REDACTED]');
      });
  });

  it('removes audit entries older than the retention period', async () => {
    const connection = await connections.getConnection('tenant_audit_test_org');
    await connection.query(
      `INSERT INTO "tenant_audit_test_org"."audit_logs"
       (user_id, action, resource, resource_id, metadata, ip_address, user_agent, created_at)
       VALUES
       ($1, 'retention.old', 'settings', 'retention-old', '{}'::jsonb, NULL, NULL, NOW() - INTERVAL '91 days'),
       ($1, 'retention.current', 'settings', 'retention-current', '{}'::jsonb, NULL, NULL, NOW())`,
      [ownerId],
    );

    const deleted = await auditService.cleanupExpiredEntries('tenant_audit_test_org', 90);
    const rows = await connection.query(
      `SELECT resource_id FROM "tenant_audit_test_org"."audit_logs"
       WHERE resource_id LIKE 'retention-%' ORDER BY resource_id`,
    );

    expect(deleted).toBe(1);
    expect(rows).toEqual([{ resource_id: 'retention-current' }]);
  });
});
