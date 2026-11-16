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
    await app.listen(0, '127.0.0.1');

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
    await dataSource.query(`DELETE FROM public.installed_plugins WHERE tenant_id = $1`, [tenantId]);
    await dataSource.query(`DELETE FROM public.tenant_memberships WHERE tenant_id = $1`, [
      tenantId,
    ]);
    await dataSource.query(`DELETE FROM public.tenants WHERE id = $1`, [tenantId]);
    await dataSource.query(`DELETE FROM public.users WHERE email = ANY($1)`, [
      [ownerEmail, adminEmail, viewerEmail],
    ]);
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
        query: 'summary ~ "Primary authorization" OR summary ~ "Secondary authorization"',
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

  it("prevents demoting the tenant's last owner", async () => {
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

  it("prevents privileged users from editing another user's comment or time entry", async () => {
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

    const response = await authenticated(ownerToken).get('/api/v1/webhooks').expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0]).not.toHaveProperty('secret');
  });

  it('stores webhook deliveries in the active tenant schema', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('ok', { status: 200 }));

    try {
      await authenticated(ownerToken).post(`/api/v1/webhooks/${webhookId}/test`).expect(201);
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

    const [migration] = await dataSource.query(`SELECT to_regclass($1) AS table_name`, [
      `${tenantSchema}.github_links`,
    ]);
    expect(migration.table_name).toBe(`${tenantSchema}.github_links`);

    const payload = JSON.stringify({ commits: [] });
    const signature = 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex');
    await request(app.getHttpServer())
      .post(`/api/v1/plugin-routes/@weaver~plugin-github/webhook/${tenantId}`)
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

    const [gitLabMigration] = await dataSource.query(`SELECT to_regclass($1) AS table_name`, [
      `${tenantSchema}.gitlab_links`,
    ]);
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

    const [bitbucketMigration] = await dataSource.query(`SELECT to_regclass($1) AS table_name`, [
      `${tenantSchema}.bitbucket_links`,
    ]);
    expect(bitbucketMigration.table_name).toBe(`${tenantSchema}.bitbucket_links`);
    await request(app.getHttpServer())
      .post(`/api/v1/plugin-routes/@weaver~plugin-bitbucket/webhook/${tenantId}`)
      .set('x-event-key', 'repo:push')
      .set(
        'x-hub-signature',
        'sha256=' +
          createHmac('sha256', bitbucketSecret)
            .update(JSON.stringify({ push: { changes: [] } }))
            .digest('hex'),
      )
      .send({ push: { changes: [] } })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/plugin-routes/@weaver~plugin-bitbucket/webhook/${tenantId}`)
      .set('x-event-key', 'repo:push')
      .send({ push: { changes: [] } })
      .expect(401);
  });
  it('binds attachment deletion to its issue and shares only the active avatar', async () => {
    const attachment = await authenticated(ownerToken)
      .post(`/api/v1/issues/${primaryIssueKey}/attachments`)
      .attach('file', Buffer.from('retained'), { filename: 'retained.txt' })
      .expect(201);
    await request(app.getHttpServer())
      .delete(`/api/v1/issues/${secondaryIssueKey}/attachments/${attachment.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(404);
    await authenticated(ownerToken)
      .get(`/api/v1/attachments/${attachment.body.id}/download`)
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/api/v1/issues/${primaryIssueKey}/attachments/${attachment.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);

    const avatar = await authenticated(ownerToken)
      .post('/api/v1/users/me/avatar')
      .attach('file', Buffer.from('89504e470d0a1a0a00000000', 'hex'), {
        filename: 'avatar.png',
        contentType: 'image/png',
      })
      .expect(201);
    await authenticated(viewerToken).get(`/api/v1${avatar.body.avatarUrl}`).expect(403);
    await authenticated(adminToken).get(`/api/v1${avatar.body.avatarUrl}`).expect(200);
    await authenticated(ownerToken)
      .post('/api/v1/users/me/avatar')
      .attach('file', Buffer.from('<svg/>'), {
        filename: 'avatar.svg',
        contentType: 'image/svg+xml',
      })
      .expect(400);
  });

  it('masks saved credentials in reads and updates without overwriting the secret', async () => {
    const secret = 'review-synthetic-secret';
    const update = await authenticated(ownerToken)
      .patch('/api/v1/plugins/settings')
      .send({ pluginId: '@weaver/plugin-github', settings: { webhookSecret: secret } })
      .expect(200);
    expect(JSON.stringify(update.body)).not.toContain(secret);
    const settings = await authenticated(ownerToken)
      .get('/api/v1/plugins/settings?pluginId=@weaver/plugin-github')
      .expect(200);
    expect(settings.body.webhookSecret).toBe('********');
    await authenticated(ownerToken)
      .patch('/api/v1/plugins/settings')
      .send({
        pluginId: '@weaver/plugin-github',
        settings: { webhookSecret: settings.body.webhookSecret },
      })
      .expect(200);
    const [plugin] = await dataSource.query(
      'SELECT settings FROM public.installed_plugins WHERE tenant_id = $1 AND plugin_id = $2',
      [tenantId, '@weaver/plugin-github'],
    );
    expect(plugin.settings.webhookSecret).toBe(secret);
  });

  it('enforces private-project visibility in relations, reports, checklist and time capabilities', async () => {
    const project = await authenticated(ownerToken)
      .post('/api/v1/projects')
      .send({ key: 'OPEN', name: 'Visible project' })
      .expect(201);
    const [viewer] = await dataSource.query('SELECT id FROM public.users WHERE email = $1', [
      viewerEmail,
    ]);
    await authenticated(ownerToken)
      .post('/api/v1/projects/OPEN/members')
      .send({ userId: viewer.id, role: 'member' })
      .expect(201);
    const issue = await authenticated(ownerToken)
      .post('/api/v1/projects/OPEN/issues')
      .send({ summary: 'Visible issue' })
      .expect(201);
    await dataSource.query(
      `UPDATE "${tenantSchema}".roles SET permissions = permissions || $1::jsonb WHERE name = 'viewer'`,
      [
        JSON.stringify({
          'relations.view': true,
          'relations.manage': true,
          'time-reports.view': true,
          'checklist.view': true,
        }),
      ],
    );
    for (const id of ['relations', 'time-reports', 'checklist', 'automatic-time']) {
      await authenticated(ownerToken)
        .post('/api/v1/plugins/install')
        .send({ pluginId: `@weaver/plugin-${id}` })
        .expect(201);
    }
    await authenticated(ownerToken)
      .post('/api/v1/plugins/enable')
      .send({ pluginId: '@weaver/plugin-automatic-time' })
      .expect(201);
    const root = `/api/v1/plugin-routes/@weaver~plugin-relations/issues/${issue.body.key}/relations`;
    await authenticated(viewerToken)
      .post(root)
      .send({ targetIssueKey: primaryIssueKey, linkType: 'blocks' })
      .expect(403);
    const link = await authenticated(ownerToken)
      .post(root)
      .send({ targetIssueKey: primaryIssueKey, linkType: 'blocks' })
      .expect(201);
    const listed = await authenticated(viewerToken).get(root).expect(200);
    expect(listed.body).toEqual([]);
    const searched = await authenticated(viewerToken)
      .get(`${root}/search?q=authorization`)
      .expect(200);
    expect(searched.body).toEqual([]);
    await request(app.getHttpServer())
      .delete(`${root}/${link.body.id}`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(403);
    const report = await authenticated(viewerToken)
      .get('/api/v1/plugin-routes/@weaver~plugin-time-reports/report')
      .expect(200);
    expect(report.body.rows).toEqual([]);
    const checklist = await authenticated(viewerToken)
      .get('/api/v1/plugin-routes/@weaver~plugin-checklist/checklists')
      .expect(200);
    expect(checklist.body).toEqual([]);
    const { tenantStorage } = await import('../src/core/tenant');
    const { PluginContextFactory } = await import('../src/plugins/plugin-context.factory');
    await tenantStorage.run({ tenantId, schemaName: tenantSchema }, async () => {
      const context = await app
        .get(PluginContextFactory)
        .create(
          '@weaver/plugin-automatic-time',
          {},
          { id: viewer.id, email: viewerEmail, displayName: 'Viewer' },
        );
      await expect(
        context.api.timeEntries.createBatch({
          entries: [
            { issueKey: primaryIssueKey, minutes: 10, sourceReference: 'forbidden-private' },
          ],
        }),
      ).rejects.toThrow('Project membership');
    });
    expect(project.body.id).toBeDefined();
  });

  it('installs the repository migration and binds deletions to the project', async () => {
    await authenticated(ownerToken)
      .post('/api/v1/plugins/install')
      .send({ pluginId: '@weaver/plugin-repository' })
      .expect(201);
    const base = '/api/v1/plugin-routes/@weaver~plugin-repository/projects/OPEN/repositories';
    const created = await authenticated(ownerToken)
      .post(base)
      .send({ name: 'Review repo', url: 'https://github.com/example/review' })
      .expect(201);
    const other = await authenticated(ownerToken)
      .post('/api/v1/projects')
      .send({ key: 'OTHER', name: 'Other project' })
      .expect(201);
    expect(other.body.id).toBeDefined();
    await request(app.getHttpServer())
      .delete(
        `/api/v1/plugin-routes/@weaver~plugin-repository/projects/OTHER/repositories/${created.body.id}`,
      )
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);
    const remaining = await authenticated(ownerToken).get(base).expect(200);
    expect(remaining.body.map((item: { id: string }) => item.id)).toContain(created.body.id);
    await authenticated(ownerToken)
      .post(base)
      .send({ name: 'Unsafe', url: 'javascript:alert(1)' })
      .expect(400);
    await request(app.getHttpServer())
      .delete(`${base}/${created.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);
    expect((await authenticated(ownerToken).get(base).expect(200)).body).toEqual([]);
  });

  it('enforces reviewed issue security through HTTP, API keys, child reads, search and revocation', async () => {
    const project = (
      await authenticated(ownerToken)
        .post('/api/v1/projects')
        .send({ key: 'SEC', name: 'Secured fixture' })
        .expect(201)
    ).body;
    const [viewer] = await dataSource.query('SELECT id FROM public.users WHERE email = $1', [
      viewerEmail,
    ]);
    await authenticated(ownerToken)
      .post('/api/v1/projects/SEC/members')
      .send({ userId: viewer.id, role: 'viewer' })
      .expect(201);
    const issue = (
      await authenticated(ownerToken)
        .post('/api/v1/projects/SEC/issues')
        .send({ summary: 'Confidential fixture' })
        .expect(201)
    ).body;
    const attachment = (
      await authenticated(ownerToken)
        .post(`/api/v1/issues/${issue.key}/attachments`)
        .attach('file', Buffer.from('secret'), { filename: 'secret.txt' })
        .expect(201)
    ).body;
    const [policy] = await dataSource.query(
      `INSERT INTO "${tenantSchema}".issue_access_policies
      (source_instance, source_project_id, security_level_id, project_id, name)
      VALUES ('https://fixture.example', 'source-sec', '10000', $1, 'Internal') RETURNING id`,
      [project.id],
    );
    await dataSource.query(
      `UPDATE "${tenantSchema}".issues SET access_state = 'restricted', access_policy_id = $1 WHERE id = $2`,
      [policy.id, issue.id],
    );
    const apiKey = (
      await authenticated(viewerToken)
        .post('/api/v1/api-keys')
        .send({ name: 'Security fixture', scopes: ['read'] })
        .expect(201)
    ).body.key;
    const revisionBefore = (
      await authenticated(viewerToken).get('/api/v1/access-revision').expect(200)
    ).body.revision;
    const assertDenied = async () => {
      await authenticated(viewerToken).get(`/api/v1/issues/${issue.key}`).expect(404);
      await authenticated(apiKey).get(`/api/v1/issues/${issue.key}`).expect(404);
      await authenticated(viewerToken).get(`/api/v1/issues/${issue.key}/comments`).expect(404);
      await authenticated(viewerToken)
        .get(`/api/v1/attachments/${attachment.id}/download`)
        .expect(404);
      const list = await authenticated(viewerToken).get('/api/v1/projects/SEC/issues').expect(200);
      expect(list.body.data).toEqual([]);
      expect(list.body.meta.total).toBe(0);
      const search = await authenticated(viewerToken)
        .post('/api/v1/search')
        .send({ query: 'summary ~ "Confidential fixture"' })
        .expect(201);
      expect(search.body.data).toEqual([]);
    };
    await assertDenied();
    await authenticated(ownerToken).get(`/api/v1/issues/${issue.key}`).expect(200);
    await authenticated(viewerToken).get('/api/v1/import/issue-security').expect(403);
    await authenticated(ownerToken)
      .post(`/api/v1/import/issue-security/${policy.id}`)
      .send({ userIds: [viewer.id], revision: 1, affectedCount: 1 })
      .expect(201);
    await authenticated(viewerToken).get(`/api/v1/issues/${issue.key}`).expect(200);
    await authenticated(apiKey).get(`/api/v1/issues/${issue.key}`).expect(200);
    await dataSource.query(
      `UPDATE "${tenantSchema}".roles SET permissions = permissions || '{"issues.update":true}'::jsonb WHERE name = 'viewer'`,
    );
    const { tenantStorage } = await import('../src/core/tenant/tenant.context');
    const { PluginContextFactory } = await import('../src/plugins/plugin-context.factory');
    await dataSource.query(
      `UPDATE "${tenantSchema}".project_members SET role = 'member' WHERE project_id = $1 AND user_id = $2`,
      [project.id, viewer.id],
    );
    const updateAsMappedViewer = () =>
      tenantStorage.run({ tenantId, schemaName: tenantSchema }, async () => {
        const context = await app
          .get(PluginContextFactory)
          .create(
            '@weaver/plugin-checklist',
            {},
            { id: viewer.id, email: viewerEmail, displayName: 'Viewer' },
          );
        return context.api.issues.update(issue.key, { percent_done: 15 });
      });
    await expect(updateAsMappedViewer()).resolves.toMatchObject({ percentDone: 15 });
    await authenticated(viewerToken)
      .get(`/api/v1/attachments/${attachment.id}/download`)
      .expect(200);
    const mappedRevision = (
      await authenticated(viewerToken).get('/api/v1/access-revision').expect(200)
    ).body.revision;
    expect(mappedRevision).not.toBe(revisionBefore);
    await authenticated(ownerToken)
      .post(`/api/v1/import/issue-security/${policy.id}`)
      .send({ userIds: [], revision: 1, affectedCount: 1 })
      .expect(409);
    await authenticated(ownerToken)
      .post(`/api/v1/import/issue-security/${policy.id}`)
      .send({ userIds: [], revision: 2, affectedCount: 1 })
      .expect(201);
    await assertDenied();
    await expect(updateAsMappedViewer()).rejects.toThrow();
    expect(
      (await authenticated(viewerToken).get('/api/v1/access-revision').expect(200)).body.revision,
    ).not.toBe(mappedRevision);
    const audit = await dataSource.query(
      `SELECT metadata FROM "${tenantSchema}".audit_logs WHERE action = 'import.issue_security_mapped' AND resource_id = $1`,
      [policy.id],
    );
    expect(audit).toHaveLength(2);
  });
  it('security regression: hides a restricted Jira remote-link title on a readable issue', async () => {
    const secret = (
      await authenticated(ownerToken)
        .post('/api/v1/projects/OPEN/issues')
        .send({ summary: 'Confidential payroll acquisition' })
        .expect(201)
    ).body;
    const visible = (
      await authenticated(ownerToken)
        .post('/api/v1/projects/OPEN/issues')
        .send({ summary: 'Readable linked issue' })
        .expect(201)
    ).body;
    await dataSource.query(
      `UPDATE "${tenantSchema}".issues SET access_state = 'quarantined' WHERE id = $1`,
      [secret.id],
    );
    await authenticated(viewerToken).get(`/api/v1/issues/${secret.key}`).expect(404);
    await dataSource.query(
      `INSERT INTO "${tenantSchema}".imported_resources
      (source_instance, kind, external_id, import_job_id, project_id, issue_id, payload)
      VALUES ('https://jira.fixture.example', 'issue', 'review-readable', gen_random_uuid(), $1, $2, $3),
             ('https://jira.fixture.example', 'remote_link', 'review-link', gen_random_uuid(), $1, $2, $4)`,
      [
        visible.projectId,
        visible.id,
        { key: visible.key, fields: {} },
        {
          id: 'remote-link-1',
          object: {
            title: secret.summary,
            url: `https://jira.fixture.example/browse/${secret.key}`,
          },
        },
      ],
    );
    const result = await authenticated(viewerToken)
      .get(`/api/v1/issues/${visible.key}/jira`)
      .expect(200);
    expect(JSON.stringify(result.body)).not.toContain(secret.summary);
  });

  it('security regression: gives authorized plugin writes the authenticated issue principal', async () => {
    await authenticated(ownerToken)
      .patch('/api/v1/plugins/settings')
      .send({ pluginId: '@weaver/plugin-checklist', settings: { syncDoneRatio: true } })
      .expect(200);
    const result = await authenticated(ownerToken)
      .post(`/api/v1/plugin-routes/@weaver~plugin-checklist/issues/${primaryIssueKey}/checklist`)
      .send({ subject: 'Private owner checklist action' });
    const rows = await dataSource.query(
      `SELECT subject FROM "${tenantSchema}".checklist_items WHERE subject = 'Private owner checklist action'`,
    );
    expect(result.status).toBe(201);
    expect(rows).toHaveLength(1);
  });

  it('security regression: masks restricted references in bundled plugin responses', async () => {
    const secret = (
      await authenticated(ownerToken)
        .post('/api/v1/projects/OPEN/issues')
        .send({ summary: 'Restricted takeover target' })
        .expect(201)
    ).body;
    const visible = (
      await authenticated(ownerToken)
        .post('/api/v1/projects/OPEN/issues')
        .send({ summary: 'Visible checklist issue' })
        .expect(201)
    ).body;
    await dataSource.query(
      `UPDATE "${tenantSchema}".issues SET access_state = 'quarantined' WHERE id = $1`,
      [secret.id],
    );
    await dataSource.query(
      `INSERT INTO "${tenantSchema}".checklist_items (issue_id, subject, position, created_by) VALUES ($1, $2, 0, $3)`,
      [visible.id, `Depends on ${secret.key}: ${secret.summary}`, ownerId],
    );
    const result = await authenticated(viewerToken)
      .get(`/api/v1/plugin-routes/@weaver~plugin-checklist/issues/${visible.key}/checklist`)
      .expect(200);
    expect(JSON.stringify(result.body)).not.toContain(secret.summary);
  });

  it('security regression: delivers ordinary rendered email after authorizing its issue', async () => {
    const { NotificationQueueService } =
      await import('../src/modules/mail/notification-queue.service');
    const { createNotificationProcessor } =
      await import('../../worker/src/processors/notifications.processor');
    const { recipientCanReadIssue } = await import('@weaver/server-common');
    const [viewer] = await dataSource.query('SELECT id FROM public.users WHERE email = $1', [
      viewerEmail,
    ]);
    const secret = (
      await authenticated(ownerToken)
        .post('/api/v1/projects/OPEN/issues')
        .send({ summary: 'Secret acquisition negotiation' })
        .expect(201)
    ).body;
    const visible = (
      await authenticated(ownerToken)
        .post('/api/v1/projects/OPEN/issues')
        .send({ summary: 'Readable discussion' })
        .expect(201)
    ).body;
    await dataSource.query(
      `UPDATE "${tenantSchema}".issues SET access_state = 'quarantined' WHERE id = $1`,
      [secret.id],
    );
    await dataSource.query(`UPDATE "${tenantSchema}".issues SET reporter_id = $1 WHERE id = $2`, [
      viewer.id,
      visible.id,
    ]);
    await dataSource.query(
      `UPDATE public.tenants SET settings = settings || $2::jsonb WHERE id = $1`,
      [
        tenantId,
        JSON.stringify({
          smtp: {
            host: '127.0.0.1',
            port: 2525,
            secure: false,
            user: '',
            pass: '',
            fromEmail: 'fixture@example.com',
            fromName: 'Fixture',
          },
        }),
      ],
    );
    const jobs: any[] = [];
    const enqueue = jest
      .spyOn(app.get(NotificationQueueService), 'enqueue')
      .mockImplementation(async (job) => {
        jobs.push(job);
      });
    try {
      await authenticated(ownerToken)
        .post(`/api/v1/issues/${visible.key}/comments`)
        .send({
          body: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: secret.summary,
                    marks: [
                      {
                        type: 'link',
                        attrs: { href: `http://localhost:5173/issues/${secret.key}` },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        })
        .expect(201);
      const response = await authenticated(viewerToken)
        .get(`/api/v1/issues/${visible.key}/comments`)
        .expect(200);
      expect(JSON.stringify(response.body)).not.toContain(secret.summary);
      expect(jobs.find((item) => item.userId === viewer.id)).toBeUndefined();
      // A link readable at enqueue time must still be checked after revocation.
      await dataSource.query(
        `UPDATE "${tenantSchema}".issues SET access_state = 'unrestricted' WHERE id = $1`,
        [secret.id],
      );
      await authenticated(ownerToken)
        .post(`/api/v1/issues/${visible.key}/comments`)
        .send({
          body: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: secret.summary,
                    marks: [
                      {
                        type: 'link',
                        attrs: { href: `http://localhost:5173/issues/${secret.key}` },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        })
        .expect(201);
      const retainedJob = jobs.find((item) => item.userId === viewer.id);
      expect(retainedJob.data.issueReferences.keys).toContain(secret.key);
      await dataSource.query(
        `UPDATE "${tenantSchema}".issues SET access_state = 'quarantined' WHERE id = $1`,
        [secret.id],
      );
      jobs.length = 0;
      await authenticated(ownerToken)
        .post(`/api/v1/issues/${visible.key}/comments`)
        .send({
          body: {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ordinary comment' }] }],
          },
        })
        .expect(201);
      const job = jobs.find((item) => item.userId === viewer.id);
      expect(job).toBeDefined();
      const sendMail = jest.fn().mockResolvedValue({});
      const processor = createNotificationProcessor({
        getTenantSmtpSettings: async () => null,
        getSystemSmtpSettings: () => ({
          host: '127.0.0.1',
          port: 2525,
          secure: false,
          user: '',
          pass: '',
          fromEmail: 'fixture@example.com',
          fromName: 'Fixture',
        }),
        allowPrivateSystemHost: true,
        canDeliverIssue: async (t, u, key) => {
          const allowed = await recipientCanReadIssue(dataSource, tenantSchema, t, u, { key });
          return allowed;
        },
        transportFactory: () => ({ sendMail }),
        rateLimiter: { wait: async () => undefined },
        logger: { info: () => undefined, warn: () => undefined },
      });
      await processor({ data: retainedJob } as never);
      expect(sendMail).not.toHaveBeenCalled();
      await processor({ data: job } as never);
      expect(sendMail).toHaveBeenCalledTimes(1);
      expect(sendMail.mock.calls[0][0].text).toContain('Ordinary comment');
      expect(sendMail.mock.calls[0][0].text).not.toContain(secret.summary);
    } finally {
      enqueue.mockRestore();
    }
  });

  it('security regression: does not interpret an event actor UUID as an issue key', async () => {
    const { eventHasRestrictedContent } = await import('@weaver/server-common');
    const blocked = await eventHasRestrictedContent(dataSource, tenantSchema, {
      issueKey: primaryIssueKey,
      userId: 'aaaaaaaa-1234-4123-8123-123456789012',
    });
    expect(blocked).toBe(false);
  });

  it('rolls back checklist writes when its issue update fails, then permits a clean retry', async () => {
    const { IssuesService } = await import('../src/modules/issues/issues.service');
    const subject = 'Rollback fixture checklist';
    const update = jest
      .spyOn(app.get(IssuesService), 'update')
      .mockRejectedValueOnce(new Error('Injected dependent failure'));
    try {
      await authenticated(ownerToken)
        .post(`/api/v1/plugin-routes/@weaver~plugin-checklist/issues/${primaryIssueKey}/checklist`)
        .send({ subject })
        .expect(500);
      expect(
        await dataSource.query(
          `SELECT id FROM "${tenantSchema}".checklist_items WHERE subject = $1`,
          [subject],
        ),
      ).toEqual([]);
    } finally {
      update.mockRestore();
    }
    await authenticated(ownerToken)
      .post(`/api/v1/plugin-routes/@weaver~plugin-checklist/issues/${primaryIssueKey}/checklist`)
      .send({ subject })
      .expect(201);
    expect(
      await dataSource.query(
        `SELECT id FROM "${tenantSchema}".checklist_items WHERE subject = $1`,
        [subject],
      ),
    ).toHaveLength(1);
  });

  it('binds direct plugin SDK service calls to their resolved member', async () => {
    const { tenantStorage } = await import('../src/core/tenant/tenant.context');
    const { PluginContextFactory } = await import('../src/plugins/plugin-context.factory');
    await tenantStorage.run({ tenantId, schemaName: tenantSchema }, async () => {
      const context = await app
        .get(PluginContextFactory)
        .create(
          '@weaver/plugin-automatic-time',
          {},
          { id: ownerId, email: ownerEmail, displayName: 'Owner' },
        );
      await expect(
        context.api.issues.update(primaryIssueKey, { percent_done: 25 }),
      ).resolves.toMatchObject({ percentDone: 25 });
      const batch = await context.api.timeEntries.createBatch({
        entries: [
          { issueKey: primaryIssueKey, minutes: 10, sourceReference: 'private-owner-entry' },
        ],
      });
      expect(batch.created).toBe(1);
      expect(batch.entries).toHaveLength(1);
    });
  });

  it('redacts restricted references before formatting time-report CSV', async () => {
    const secret = (
      await authenticated(ownerToken)
        .post('/api/v1/projects/OPEN/issues')
        .send({ summary: 'Hidden CSV acquisition' })
        .expect(201)
    ).body;
    const visible = (
      await authenticated(ownerToken)
        .post('/api/v1/projects/OPEN/issues')
        .send({ summary: `Depends on ${secret.key}: ${secret.summary}` })
        .expect(201)
    ).body;
    await authenticated(ownerToken)
      .post(`/api/v1/issues/${visible.key}/time-entries`)
      .send({ minutes: 30 })
      .expect(201);
    await dataSource.query(
      `UPDATE "${tenantSchema}".issues SET access_state = 'quarantined' WHERE id = $1`,
      [secret.id],
    );
    await dataSource.query(
      `UPDATE "${tenantSchema}".roles SET permissions = permissions || '{"time-reports.export":true}'::jsonb WHERE name = 'viewer'`,
    );
    const response = await authenticated(viewerToken)
      .get('/api/v1/plugin-routes/@weaver~plugin-time-reports/report/export?groupBy=issue')
      .expect(200);
    expect(response.text).toContain('Issue Key,Issue Title,Total Hours,Entry Count');
    expect(response.text).toContain(visible.key);
    expect(response.text).toContain('[Restricted issue reference]');
    expect(response.text).not.toContain(secret.summary);
    expect(response.text).not.toContain(secret.key);
  });
});
