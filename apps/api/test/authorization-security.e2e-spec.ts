import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { createHmac } from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TenantConnectionProvider } from '../src/core/tenant';

describe('Administrative authorization security (e2e)', () => {
  const tenantSlug = 'authorization-security';
  const tenantSchema = 'tenant_authorization_security';
  const ownerEmail = 'authorization-owner@example.com';
  const adminEmail = 'authorization-admin@example.com';
  const viewerEmail = 'authorization-viewer@example.com';

  let app: INestApplication;
  let dataSource: DataSource;
  let connections: TenantConnectionProvider;
  let tenantId: string;
  let ownerId: string;
  let ownerToken: string;
  let adminId: string;
  let adminToken: string;
  let viewerToken: string;
  let webhookId: string;
  let primaryIssueKey: string;
  let secondaryIssueKey: string;
  let ownerCommentId: string;
  let ownerTimeEntryId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api/v1');
    await app.init();

    dataSource = app.get(DataSource);
    connections = app.get(TenantConnectionProvider);

    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: ownerEmail,
        password: 'password123',
        displayName: 'Authorization Owner',
        orgName: 'Authorization Security',
        orgSlug: tenantSlug,
      })
      .expect(201);

    tenantId = registration.body.tenantId;
    ownerId = registration.body.user.id;
    ownerToken = registration.body.accessToken;

    const passwordHash = await bcrypt.hash('password123', 10);
    const [admin] = await dataSource.query(
      `INSERT INTO public.users
         (id, email, display_name, password_hash, auth_provider, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'Authorization Admin', $2, 'local', NOW(), NOW())
       RETURNING id`,
      [adminEmail, passwordHash],
    );
    adminId = admin.id;

    const [viewer] = await dataSource.query(
      `INSERT INTO public.users
         (id, email, display_name, password_hash, auth_provider, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'Authorization Viewer', $2, 'local', NOW(), NOW())
       RETURNING id`,
      [viewerEmail, passwordHash],
    );

    await dataSource.query(
      `INSERT INTO public.tenant_memberships
         (tenant_id, user_id, role, created_at)
       VALUES ($1, $2, 'admin', NOW()), ($1, $3, 'viewer', NOW())`,
      [tenantId, adminId, viewer.id],
    );

    adminToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: adminEmail, password: 'password123' })
        .expect(201)
    ).body.accessToken;
    viewerToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: viewerEmail, password: 'password123' })
        .expect(201)
    ).body.accessToken;

    await dataSource.query(
      `INSERT INTO public.installed_plugins
         (id, tenant_id, plugin_id, version, enabled, settings, installed_at)
       VALUES (gen_random_uuid(), $1, '@weaver/security-fixture', '1.0.0', true,
         '{"webhookSecret":"must-not-leak"}'::jsonb, NOW())`,
      [tenantId],
    );

    await request(app.getHttpServer())
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ key: 'AUTH', name: 'Authorization Project' })
      .expect(201);

    primaryIssueKey = (
      await request(app.getHttpServer())
        .post('/api/v1/projects/AUTH/issues')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ summary: 'Primary authorization issue' })
        .expect(201)
    ).body.key;
    secondaryIssueKey = (
      await request(app.getHttpServer())
        .post('/api/v1/projects/AUTH/issues')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ summary: 'Secondary authorization issue' })
        .expect(201)
    ).body.key;

    ownerCommentId = (
      await request(app.getHttpServer())
        .post(`/api/v1/issues/${primaryIssueKey}/comments`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ body: { type: 'doc', content: [] } })
        .expect(201)
    ).body.id;
    ownerTimeEntryId = (
      await request(app.getHttpServer())
        .post(`/api/v1/issues/${primaryIssueKey}/time-entries`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ minutes: 15, description: 'Owner entry' })
        .expect(201)
    ).body.id;
  });

  afterAll(async () => {
    await dataSource.query(`DROP SCHEMA IF EXISTS "${tenantSchema}" CASCADE`);
    await dataSource.query(
      `DELETE FROM public.installed_plugins WHERE tenant_id = $1`,
      [tenantId],
    );
    await dataSource.query(
      `DELETE FROM public.tenant_memberships WHERE tenant_id = $1`,
      [tenantId],
    );
    await dataSource.query(`DELETE FROM public.tenants WHERE id = $1`, [tenantId]);
    await dataSource.query(
      `DELETE FROM public.users WHERE email = ANY($1)`,
      [[ownerEmail, adminEmail, viewerEmail]],
    );
    await connections.closeAll();
    await app.close();
  });

  const authenticated = (token: string) => ({
    get: (url: string) =>
      request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string) =>
      request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`),
    patch: (url: string) =>
      request(app.getHttpServer()).patch(url).set('Authorization', `Bearer ${token}`),
  });

  it('does not expose plugin settings to regular tenant members', async () => {
    const response = await authenticated(viewerToken).get('/api/v1/plugins').expect(200);

    expect(response.body).toEqual([
      expect.objectContaining({
        pluginId: '@weaver/security-fixture',
        version: '1.0.0',
        enabled: true,
      }),
    ]);
    expect(response.body[0]).not.toHaveProperty('settings');
    expect(response.body[0]).not.toHaveProperty('tenantId');
  });

  it('prevents viewers from changing plugin installation state', async () => {
    await authenticated(viewerToken)
      .post('/api/v1/plugins/install')
      .send({ pluginId: 'non-existent-plugin' })
      .expect(403);
  });

  it('keeps OR-based WQL searches inside the viewer project boundary', async () => {
    const response = await authenticated(viewerToken)
      .post('/api/v1/search')
      .send({
        query:
          'summary ~ "Primary authorization" OR summary ~ "Secondary authorization"',
      })
      .expect(201);

    expect(response.body.data).toEqual([]);
  });

  it('allows only the uploader to download an unlinked attachment', async () => {
    const uploaded = await authenticated(ownerToken)
      .post('/api/v1/attachments/upload')
      .attach('file', Buffer.from('private orphan attachment'), {
        filename: 'orphan.txt',
        contentType: 'text/plain',
      })
      .expect(201);

    await authenticated(viewerToken)
      .get(`/api/v1/attachments/${uploaded.body.id}/download`)
      .expect(403);
    await authenticated(ownerToken)
      .get(`/api/v1/attachments/${uploaded.body.id}/download`)
      .expect(200);
  });

  it('prevents admins from granting the owner role', async () => {
    const response = await authenticated(adminToken)
      .patch(`/api/v1/users/${adminId}/role`)
      .send({ role: 'owner' });

    if (response.status < 400) {
      await dataSource.query(
        `UPDATE public.tenant_memberships SET role = 'admin'
         WHERE tenant_id = $1 AND user_id = $2`,
        [tenantId, adminId],
      );
    }
    expect(response.status).toBe(403);
  });

  it('prevents demoting the tenant\'s last owner', async () => {
    const response = await authenticated(ownerToken)
      .patch(`/api/v1/users/${ownerId}/role`)
      .send({ role: 'admin' });

    if (response.status < 400) {
      await dataSource.query(
        `UPDATE public.tenant_memberships SET role = 'owner'
         WHERE tenant_id = $1 AND user_id = $2`,
        [tenantId, ownerId],
      );
    }
    expect(response.status).toBe(400);
  });

  it('prevents privileged users from editing another user\'s comment or time entry', async () => {
    const commentResponse = await authenticated(adminToken)
      .patch(`/api/v1/issues/${primaryIssueKey}/comments/${ownerCommentId}`)
      .send({ body: { type: 'doc', content: [] } });
    const timeResponse = await authenticated(adminToken)
      .patch(`/api/v1/issues/${primaryIssueKey}/time-entries/${ownerTimeEntryId}`)
      .send({ minutes: 60 });

    expect(commentResponse.status).toBe(403);
    expect(timeResponse.status).toBe(403);
  });

  it('rejects comment and time-entry IDs that do not belong to the issue path', async () => {
    const commentResponse = await authenticated(ownerToken)
      .patch(`/api/v1/issues/${secondaryIssueKey}/comments/${ownerCommentId}`)
      .send({ body: { type: 'doc', content: [] } });
    const timeResponse = await authenticated(ownerToken)
      .patch(`/api/v1/issues/${secondaryIssueKey}/time-entries/${ownerTimeEntryId}`)
      .send({ minutes: 30 });

    expect(commentResponse.status).toBe(404);
    expect(timeResponse.status).toBe(404);
  });

  it('rejects webhook destinations on private or link-local networks', async () => {
    await authenticated(ownerToken)
      .post('/api/v1/webhooks')
      .send({
        url: 'http://169.254.169.254/latest/meta-data',
        events: ['issue.created'],
        secret: 'security-test-secret-security-test',
      })
      .expect(400);
  });

  it('never returns stored webhook signing secrets from list responses', async () => {
    const created = await authenticated(ownerToken)
      .post('/api/v1/webhooks')
      .send({
        url: 'https://1.1.1.1/webhook',
        events: ['issue.created'],
        secret: 'security-test-secret-security-test',
      })
      .expect(201);
    webhookId = created.body.id;

    const response = await authenticated(ownerToken)
      .get('/api/v1/webhooks')
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0]).not.toHaveProperty('secret');
  });

  it('stores webhook deliveries in the active tenant schema', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('ok', { status: 200 }));

    try {
      await authenticated(ownerToken)
        .post(`/api/v1/webhooks/${webhookId}/test`)
        .expect(201);
    } finally {
      fetchSpy.mockRestore();
    }

    const response = await authenticated(ownerToken)
      .get(`/api/v1/webhooks/${webhookId}/deliveries`)
      .expect(200);

    expect(response.body).toEqual([
      expect.objectContaining({
        webhook_id: webhookId,
        event: 'webhook.test',
        response_status: 200,
        response_body: 'ok',
        success: true,
      }),
    ]);
  });

  it('installs and accepts signed GitHub webhooks without a Weaver login', async () => {
    const secret = 'github-webhook-security-secret';
    await authenticated(ownerToken)
      .post('/api/v1/plugins/install')
      .send({ pluginId: '@weaver/plugin-github' })
      .expect(201);
    await authenticated(ownerToken)
      .patch('/api/v1/plugins/settings')
      .send({
        pluginId: '@weaver/plugin-github',
        settings: { webhookSecret: secret },
      })
      .expect(200);

    const [migration] = await dataSource.query(
      `SELECT to_regclass($1) AS table_name`,
      [`${tenantSchema}.github_links`],
    );
    expect(migration.table_name).toBe(`${tenantSchema}.github_links`);

    const payload = JSON.stringify({ commits: [] });
    const signature =
      'sha256=' + createHmac('sha256', secret).update(payload).digest('hex');
    await request(app.getHttpServer())
      .post(
        `/api/v1/plugin-routes/@weaver~plugin-github/webhook/${tenantId}`,
      )
      .set('x-github-event', 'push')
      .set('x-hub-signature-256', signature)
      .set('Content-Type', 'application/json')
      .send(payload)
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/v1/plugin-routes/@weaver~plugin-github/links/AUTH-1')
      .expect(401);
  });

  it('installs and authenticates GitLab and Bitbucket webhooks', async () => {
    const gitLabSecret = 'gitlab-webhook-security-secret';
    await authenticated(ownerToken)
      .post('/api/v1/plugins/install')
      .send({ pluginId: '@weaver/plugin-gitlab' })
      .expect(201);
    await authenticated(ownerToken)
      .patch('/api/v1/plugins/settings')
      .send({
        pluginId: '@weaver/plugin-gitlab',
        settings: { webhookSecret: gitLabSecret },
      })
      .expect(200);

    const [gitLabMigration] = await dataSource.query(
      `SELECT to_regclass($1) AS table_name`,
      [`${tenantSchema}.gitlab_links`],
    );
    expect(gitLabMigration.table_name).toBe(`${tenantSchema}.gitlab_links`);
    await request(app.getHttpServer())
      .post(`/api/v1/plugin-routes/@weaver~plugin-gitlab/webhook/${tenantId}`)
      .set('x-gitlab-event', 'Push Hook')
      .set('x-gitlab-token', gitLabSecret)
      .send({ commits: [] })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/plugin-routes/@weaver~plugin-gitlab/webhook/${tenantId}`)
      .set('x-gitlab-event', 'Push Hook')
      .set('x-gitlab-token', 'wrong-token')
      .send({ commits: [] })
      .expect(401);

    const bitbucketSecret = 'bitbucket-webhook-security-secret';
    await authenticated(ownerToken)
      .post('/api/v1/plugins/install')
      .send({ pluginId: '@weaver/plugin-bitbucket' })
      .expect(201);
    await authenticated(ownerToken)
      .patch('/api/v1/plugins/settings')
      .send({
        pluginId: '@weaver/plugin-bitbucket',
        settings: { webhookSecret: bitbucketSecret },
      })
      .expect(200);

    const [bitbucketMigration] = await dataSource.query(
      `SELECT to_regclass($1) AS table_name`,
      [`${tenantSchema}.bitbucket_links`],
    );
    expect(bitbucketMigration.table_name).toBe(`${tenantSchema}.bitbucket_links`);
    await request(app.getHttpServer())
      .post(
        `/api/v1/plugin-routes/@weaver~plugin-bitbucket/webhook/${tenantId}`,
      )
      .set('x-event-key', 'repo:push')
      .set('x-hub-signature', 'sha256=' + createHmac('sha256', bitbucketSecret).update(JSON.stringify({ push: { changes: [] } })).digest('hex'))
      .send({ push: { changes: [] } })
      .expect(200);
    await request(app.getHttpServer())
      .post(
        `/api/v1/plugin-routes/@weaver~plugin-bitbucket/webhook/${tenantId}`,
      )
      .set('x-event-key', 'repo:push')
      .send({ push: { changes: [] } })
      .expect(401);
  });
  it('binds attachment deletion to its issue and shares only the active avatar', async () => {
    const attachment = await authenticated(ownerToken).post(`/api/v1/issues/${primaryIssueKey}/attachments`)
      .attach('file', Buffer.from('retained'), { filename: 'retained.txt' }).expect(201);
    await request(app.getHttpServer()).delete(`/api/v1/issues/${secondaryIssueKey}/attachments/${attachment.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`).expect(404);
    await authenticated(ownerToken).get(`/api/v1/attachments/${attachment.body.id}/download`).expect(200);
    await request(app.getHttpServer()).delete(`/api/v1/issues/${primaryIssueKey}/attachments/${attachment.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`).expect(204);

    const avatar = await authenticated(ownerToken).post('/api/v1/users/me/avatar')
      .attach('file', Buffer.from('89504e470d0a1a0a00000000', 'hex'), { filename: 'avatar.png', contentType: 'image/png' }).expect(201);
    await authenticated(viewerToken).get(`/api/v1${avatar.body.avatarUrl}`).expect(200);
    await authenticated(ownerToken).post('/api/v1/users/me/avatar')
      .attach('file', Buffer.from('<svg/>'), { filename: 'avatar.svg', contentType: 'image/svg+xml' }).expect(400);
  });

  it('masks saved credentials in reads and updates without overwriting the secret', async () => {
    const secret = 'review-synthetic-secret';
    const update = await authenticated(ownerToken).patch('/api/v1/plugins/settings')
      .send({ pluginId: '@weaver/plugin-github', settings: { webhookSecret: secret } }).expect(200);
    expect(JSON.stringify(update.body)).not.toContain(secret);
    const settings = await authenticated(ownerToken).get('/api/v1/plugins/settings?pluginId=@weaver/plugin-github').expect(200);
    expect(settings.body.webhookSecret).toBe('********');
    await authenticated(ownerToken).patch('/api/v1/plugins/settings')
      .send({ pluginId: '@weaver/plugin-github', settings: { webhookSecret: settings.body.webhookSecret } }).expect(200);
    const [plugin] = await dataSource.query('SELECT settings FROM public.installed_plugins WHERE tenant_id = $1 AND plugin_id = $2', [tenantId, '@weaver/plugin-github']);
    expect(plugin.settings.webhookSecret).toBe(secret);
  });

  it('enforces private-project visibility in relations, reports, checklist and time capabilities', async () => {
    const project = await authenticated(ownerToken).post('/api/v1/projects').send({ key: 'OPEN', name: 'Visible project' }).expect(201);
    const [viewer] = await dataSource.query('SELECT id FROM public.users WHERE email = $1', [viewerEmail]);
    await authenticated(ownerToken).post('/api/v1/projects/OPEN/members').send({ userId: viewer.id, role: 'member' }).expect(201);
    const issue = await authenticated(ownerToken).post('/api/v1/projects/OPEN/issues').send({ summary: 'Visible issue' }).expect(201);
    await dataSource.query(`UPDATE "${tenantSchema}".roles SET permissions = permissions || $1::jsonb WHERE name = 'viewer'`, [JSON.stringify({
      'relations.view': true, 'relations.manage': true, 'time-reports.view': true, 'checklist.view': true,
    })]);
    for (const id of ['relations', 'time-reports', 'checklist', 'automatic-time']) {
      await authenticated(ownerToken).post('/api/v1/plugins/install').send({ pluginId: `@weaver/plugin-${id}` }).expect(201);
    }
    await authenticated(ownerToken).post('/api/v1/plugins/enable').send({ pluginId: '@weaver/plugin-automatic-time' }).expect(201);
    const root = `/api/v1/plugin-routes/@weaver~plugin-relations/issues/${issue.body.key}/relations`;
    await authenticated(viewerToken).post(root).send({ targetIssueKey: primaryIssueKey, linkType: 'blocks' }).expect(403);
    const link = await authenticated(ownerToken).post(root).send({ targetIssueKey: primaryIssueKey, linkType: 'blocks' }).expect(201);
    const listed = await authenticated(viewerToken).get(root).expect(200);
    expect(listed.body).toEqual([]);
    const searched = await authenticated(viewerToken).get(`${root}/search?q=authorization`).expect(200);
    expect(searched.body).toEqual([]);
    await request(app.getHttpServer()).delete(`${root}/${link.body.id}`).set('Authorization', `Bearer ${viewerToken}`).expect(403);
    const report = await authenticated(viewerToken).get('/api/v1/plugin-routes/@weaver~plugin-time-reports/report').expect(200);
    expect(report.body.rows).toEqual([]);
    const checklist = await authenticated(viewerToken).get('/api/v1/plugin-routes/@weaver~plugin-checklist/checklists').expect(200);
    expect(checklist.body).toEqual([]);
    const { tenantStorage } = await import('../src/core/tenant');
    const { PluginContextFactory } = await import('../src/plugins/plugin-context.factory');
    await tenantStorage.run({ tenantId, schemaName: tenantSchema }, async () => {
      const context = await app.get(PluginContextFactory).create('@weaver/plugin-automatic-time', {}, { id: viewer.id, email: viewerEmail, displayName: 'Viewer' });
      await expect(context.api.timeEntries.createBatch({ entries: [{ issueKey: primaryIssueKey, minutes: 10, sourceReference: 'forbidden-private' }] })).rejects.toThrow('Project membership');
    });
    expect(project.body.id).toBeDefined();
  });

  it('installs the repository migration and binds deletions to the project', async () => {
    await authenticated(ownerToken).post('/api/v1/plugins/install').send({ pluginId: '@weaver/plugin-repository' }).expect(201);
    const base = '/api/v1/plugin-routes/@weaver~plugin-repository/projects/OPEN/repositories';
    const created = await authenticated(ownerToken).post(base).send({ name: 'Review repo', url: 'https://github.com/example/review' }).expect(201);
    const other = await authenticated(ownerToken).post('/api/v1/projects').send({ key: 'OTHER', name: 'Other project' }).expect(201);
    expect(other.body.id).toBeDefined();
    await request(app.getHttpServer()).delete(`/api/v1/plugin-routes/@weaver~plugin-repository/projects/OTHER/repositories/${created.body.id}`).set('Authorization', `Bearer ${ownerToken}`).expect(204);
    const remaining = await authenticated(ownerToken).get(base).expect(200);
    expect(remaining.body.map((item: { id: string }) => item.id)).toContain(created.body.id);
    await authenticated(ownerToken).post(base).send({ name: 'Unsafe', url: 'javascript:alert(1)' }).expect(400);
    await request(app.getHttpServer()).delete(`${base}/${created.body.id}`).set('Authorization', `Bearer ${ownerToken}`).expect(204);
    expect((await authenticated(ownerToken).get(base).expect(200)).body).toEqual([]);
  });

});
