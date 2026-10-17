import { createHmac, randomBytes, randomUUID } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { TenantConnectionProvider } from '../src/core/tenant';
import { PluginContextFactory } from '../src/plugins/plugin-context.factory';

// Jam is reached only through its MCP server, so the fake below answers at the plugin HTTP
// boundary with the text/event-stream replies the real server sends (docs/roadmap/30-jam-plugin.md,
// Phase 0 results). Webhooks are signed the way Jam's Svix portal signs them.
describe('Jam plugin (e2e)', () => {
  jest.setTimeout(60_000);

  const pluginId = '@weaver/plugin-jam';
  const route = '/api/v1/plugin-routes/@weaver~plugin-jam';
  const tenantSlug = 'jam-plugin-e2e';
  const schemaName = 'tenant_jam_plugin_e2e';
  const ownerEmail = 'jam-plugin-owner@example.invalid';
  const teamId = 'c8013d4d-0000-4000-8000-00000000a001';
  const otherTeamId = 'c8013d4d-0000-4000-8000-00000000b002';
  const webhookSecret = `whsec_${randomBytes(24).toString('base64')}`;
  const people = {
    reporter: {
      email: 'jam-plugin-reporter@example.invalid',
      name: 'Riley Reporter',
      role: 'member',
    },
    viewer: { email: 'jam-plugin-viewer@example.invalid', name: 'Vic Viewer', role: 'member' },
  } as const;
  const emails = [ownerEmail, ...Object.values(people).map((person) => person.email)];

  let app: INestApplication;
  let dataSource: DataSource;
  let connections: TenantConnectionProvider;
  let tenantId: string;
  let ownerToken: string;
  let ownerId: string;
  const tokens: Record<keyof typeof people, string> = { reporter: '', viewer: '' };
  const ids: Record<keyof typeof people, string> = { reporter: '', viewer: '' };

  // Fake Jam MCP server.
  let jamMode: 'ok' | 'down' | 'unauthorized' = 'ok';
  const jamCalls: Array<{ tool: string; args: Record<string, any>; authorization?: string }> = [];
  const jamDirectory = new Map<string, Record<string, unknown>>();
  let makeRequestSpy: jest.SpyInstance;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api/v1');
    await app.init();
    dataSource = app.get(DataSource);
    connections = app.get(TenantConnectionProvider);
    await cleanupTestData();

    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: ownerEmail,
        password: 'password123',
        displayName: 'Owner Olivia',
        orgName: 'Jam E2E',
        orgSlug: tenantSlug,
      })
      .expect(201);
    ownerToken = registration.body.accessToken;
    tenantId = registration.body.tenantId;
    ownerId = registration.body.user.id;

    const passwordHash = await bcrypt.hash('password123', 10);
    for (const [name, person] of Object.entries(people) as Array<
      [keyof typeof people, (typeof people)[keyof typeof people]]
    >) {
      const [row] = await dataSource.query(
        `INSERT INTO public.users (email, display_name, password_hash, auth_provider) VALUES ($1, $2, $3, 'local') RETURNING id`,
        [person.email, person.name, passwordHash],
      );
      ids[name] = row.id;
      await dataSource.query(
        'INSERT INTO public.tenant_memberships (tenant_id, user_id, role) VALUES ($1, $2, $3)',
        [tenantId, row.id, person.role],
      );
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: person.email, password: 'password123' })
        .expect(201);
      tokens[name] = login.body.accessToken;
    }
    // Tenant members get the Jam permissions; project roles still decide which issues they reach.
    await dataSource.query(
      `UPDATE "${schemaName}".roles
          SET permissions = permissions::jsonb || '{"jam.view": true, "jam.link": true, "jam.triage": true}'::jsonb
        WHERE name = 'member'`,
    );

    await as().post('/api/v1/projects').send({ name: 'Jam Intake', key: 'JAM' }).expect(201);
    await as().post('/api/v1/projects').send({ name: 'Private', key: 'PRIV' }).expect(201);
    await as()
      .post('/api/v1/projects/JAM/members')
      .send({ userId: ids.reporter, role: 'member' })
      .expect(201);
    await as()
      .post('/api/v1/projects/JAM/members')
      .send({ userId: ids.viewer, role: 'viewer' })
      .expect(201);

    await as().post('/api/v1/plugins/install').send({ pluginId }).expect(201);
    await as().post('/api/v1/plugins/enable').send({ pluginId }).expect(201);
    await as()
      .patch('/api/v1/plugins/settings')
      .send({
        pluginId,
        settings: {
          jamWorkspaceId: teamId,
          jamApiToken: 'jam_pat_e2e',
          jamAccessExpiresOn: '2099-01-01',
          jamWebhookSecret: webhookSecret,
          postBacklinkComments: true,
        },
      })
      .expect(200);

    const originalMakeRequest = (PluginContextFactory.prototype as any).makeRequest;
    makeRequestSpy = jest
      .spyOn(PluginContextFactory.prototype as any, 'makeRequest')
      .mockImplementation(async function (
        this: unknown,
        method: unknown,
        url: unknown,
        body: any,
        options: any,
      ) {
        if (typeof url === 'string' && url.startsWith('https://mcp.jam.dev/'))
          return fakeJam(body, options);
        return originalMakeRequest.call(this, method, url, body, options);
      });
  });

  afterAll(async () => {
    makeRequestSpy?.mockRestore();
    if (connections) await connections.closeAll();
    if (dataSource?.isInitialized) await cleanupTestData();
    if (app) await app.close();
  });

  beforeEach(() => {
    jamMode = 'ok';
    jamCalls.length = 0;
  });

  async function cleanupTestData(): Promise<void> {
    await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    for (const table of ['installed_plugins', 'tenant_memberships']) {
      await dataSource.query(
        `DELETE FROM public.${table} WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug = $1)`,
        [tenantSlug],
      );
    }
    await dataSource.query('DELETE FROM public.tenants WHERE slug = $1', [tenantSlug]);
    await dataSource.query('DELETE FROM public.users WHERE email = ANY($1::text[])', [emails]);
  }

  function as(token = ownerToken) {
    const server = app.getHttpServer();
    const withAuth = (test: request.Test) =>
      test.set('Authorization', `Bearer ${token}`).set('X-Tenant-ID', tenantId);
    return {
      get: (url: string) => withAuth(request(server).get(url)),
      post: (url: string) => withAuth(request(server).post(url)),
      patch: (url: string) => withAuth(request(server).patch(url)),
      delete: (url: string) => withAuth(request(server).delete(url)),
    };
  }

  function fakeJam(body: any, options: any) {
    const tool = body?.params?.name as string;
    const args = (body?.params?.arguments ?? {}) as Record<string, any>;
    jamCalls.push({ tool, args, authorization: options?.headers?.Authorization });
    if (jamMode === 'unauthorized') {
      return {
        status: 401,
        data: '{"error":"invalid_token"}',
        headers: { 'content-type': 'application/json' },
      };
    }
    if (jamMode === 'down')
      return {
        status: 503,
        data: 'Service Unavailable',
        headers: { 'content-type': 'text/plain' },
      };
    const text = (value: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
    let result: Record<string, unknown>;
    switch (tool) {
      case 'getDetails': {
        const details = jamDirectory.get(args.jamId);
        result = details
          ? {
              content: [
                { type: 'text', text: JSON.stringify(details) },
                { type: 'text', text: '## Investigation Guide' },
              ],
            }
          : { content: [{ type: 'text', text: 'Jam not found' }], isError: true };
        break;
      }
      case 'createComment':
        result = text({ id: randomUUID(), jamId: args.jamId, body: args.body });
        break;
      case 'searchJams': {
        const from = args.window?.from as string | undefined;
        const jams = [...jamDirectory.values()]
          .filter((details) => !from || String(details.createdAt) >= from)
          .sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)))
          .map((details) => ({
            id: details.jamId,
            url: `https://jam.dev/c/${details.jamId}?s=mcp`,
            type: details.type,
            origin: details.origin,
            title: details.title,
            author: details.author,
            folder: null,
            createdAt: details.createdAt,
            updatedAt: details.createdAt,
          }));
        result = text({
          jams,
          counts: { jams: null },
          page: { limit: args.page?.limit, hasMore: false },
        });
        break;
      }
      default:
        result = { content: [{ type: 'text', text: `Unknown tool ${tool}` }], isError: true };
    }
    const sse = `event: message\ndata: ${JSON.stringify({ result, jsonrpc: '2.0', id: body.id })}\n\n`;
    return {
      status: 200,
      data: options?.responseType === 'text' ? sse : null,
      headers: { 'content-type': 'text/event-stream' },
    };
  }

  function jamCreated(overrides: Record<string, unknown> = {}) {
    const jamId = randomUUID();
    return {
      jamId,
      jamUrl: `https://jam.dev/c/${jamId}`,
      teamId,
      type: 'video',
      createdAt: new Date().toISOString(),
      title: 'Checkout button does nothing',
      description: 'Clicked checkout twice.\n\nNothing happened.',
      originalUrl: 'https://shop.example.test/cart?step=2',
      origin: 'extension_chrome',
      isIncognito: false,
      author: { email: people.reporter.email.toUpperCase(), name: people.reporter.name },
      media: {
        thumbnailUrl: 'https://cdn-jam-screenshots.jam.dev/abc/screenshot/thumb.png',
        videoUrl: 'https://cdn-jam-screenshots.jam.dev/abc/video/recording.webm',
      },
      systemInfo: {
        browser: { name: 'Chrome', version: '154.0' },
        os: { name: 'macOS (arm)', version: '27.0.0' },
        screen: { width: 1678, height: 997 },
        battery: { level: 1, charging: true },
        connection: { effectiveType: '4g', rttMs: 50, downlinkMbps: 10 },
      },
      ...overrides,
    };
  }

  function directoryEntry(
    payload: ReturnType<typeof jamCreated>,
    overrides: Record<string, unknown> = {},
  ) {
    return {
      jamId: payload.jamId,
      teamId: payload.teamId,
      type: payload.type,
      origin: payload.origin,
      title: payload.title,
      description: payload.description,
      author: { id: randomUUID(), ...payload.author },
      systemInfo: {
        browser: { name: 'Chrome', version: '154.0' },
        screenDimensions: { width: 1440, height: 900 },
      },
      createdAt: payload.createdAt,
      ...overrides,
    };
  }

  let deliveries = 0;
  function sendWebhook(
    payload: unknown,
    options: { id?: string; timestamp?: number; secret?: string; signedBody?: string } = {},
  ) {
    const raw = JSON.stringify(payload);
    const id = options.id ?? `msg_e2e_${++deliveries}`;
    const timestamp = String(options.timestamp ?? Math.floor(Date.now() / 1000));
    const key = Buffer.from((options.secret ?? webhookSecret).replace(/^whsec_/, ''), 'base64');
    const signature = createHmac('sha256', key)
      .update(`${id}.${timestamp}.${options.signedBody ?? raw}`)
      .digest('base64');
    return request(app.getHttpServer())
      .post(`${route}/webhook/${tenantId}`)
      .set('Content-Type', 'application/json')
      .set('svix-id', id)
      .set('svix-timestamp', timestamp)
      .set('svix-signature', `v1,${signature}`)
      .send(raw);
  }

  async function jamRow(jamId: string) {
    const [row] = await dataSource.query(
      `SELECT * FROM "${schemaName}".jam_items WHERE jam_id = $1`,
      [jamId],
    );
    return row;
  }

  async function createIssue(projectKey: string, summary: string): Promise<string> {
    const response = await as()
      .post(`/api/v1/projects/${projectKey}/issues`)
      .send({ summary })
      .expect(201);
    return response.body.key;
  }

  describe('webhook', () => {
    it('stores a signed jam.created delivery once, without media it should not keep', async () => {
      const payload = jamCreated();
      await sendWebhook(payload, { id: 'msg_e2e_once' }).expect(200);
      await sendWebhook(payload, { id: 'msg_e2e_once' }).expect(200);
      await sendWebhook(payload, { id: 'msg_e2e_same_jam' }).expect(200);

      const rows = await dataSource.query(
        `SELECT count(*)::int AS count FROM "${schemaName}".jam_items WHERE jam_id = $1`,
        [payload.jamId],
      );
      expect(rows[0].count).toBe(1);

      const inbox = await as().get(`${route}/inbox`).expect(200);
      const item = inbox.body.items.find((jam: { jamId: string }) => jam.jamId === payload.jamId);
      expect(item).toMatchObject({
        jamUrl: `https://jam.dev/c/${payload.jamId}`,
        title: 'Checkout button does nothing',
        originalUrl: 'https://shop.example.test/cart?step=2',
        authorEmail: people.reporter.email,
        thumbnailUrl: 'https://cdn-jam-screenshots.jam.dev/abc/screenshot/thumb.png',
        systemInfo: {
          browser: { name: 'Chrome', version: '154.0' },
          os: { name: 'macOS (arm)', version: '27.0.0' },
          screen: { width: 1678, height: 997 },
          connection: { effectiveType: '4g' },
        },
        state: 'new',
        receivedVia: 'webhook',
      });
      expect(JSON.stringify(inbox.body)).not.toContain('recording.webm');
      expect(JSON.stringify(inbox.body)).not.toContain('battery');
    });

    it('rejects a tampered body, a stale timestamp, the wrong secret, and another workspace', async () => {
      const payload = jamCreated();
      await sendWebhook(payload, {
        signedBody: JSON.stringify({ ...payload, title: 'Original' }),
      }).expect(401);
      await sendWebhook(payload, { timestamp: Math.floor(Date.now() / 1000) - 600 }).expect(401);
      await sendWebhook(payload, { secret: `whsec_${randomBytes(24).toString('base64')}` }).expect(
        401,
      );
      await sendWebhook({ ...payload, teamId: otherTeamId }).expect(400);
      expect(await jamRow(payload.jamId)).toBeUndefined();

      const connection = await as().get(`${route}/connection`).expect(200);
      expect(connection.body.connectionError.message).toContain(otherTeamId);
    });

    it('acknowledges events it does not handle', async () => {
      await sendWebhook({ recordingLinkId: randomUUID(), publicId: 'Ty56aWc', teamId }).expect(
        200,
        {
          message: 'Ignored event',
        },
      );
    });
  });

  describe('triage', () => {
    it('creates an issue with the Jam author as reporter, a Jam description, and a backlink in Jam', async () => {
      const payload = jamCreated();
      await sendWebhook(payload).expect(200);

      const created = await as()
        .post(`${route}/inbox/${payload.jamId}/create-issue`)
        .send({ projectKey: 'JAM', priority: 'high', labels: ['jam', 'jam', 'checkout'] })
        .expect(201);
      const key = created.body.issue.key;
      expect(created.body.issue.reporterId).toBe(ids.reporter);
      expect(created.body.backlinkState).toBe('posted');

      const issue = await as().get(`/api/v1/issues/${key}`).expect(200);
      expect(issue.body.summary).toBe('Checkout button does nothing');
      expect(issue.body.priority).toBe('high');
      expect(issue.body.labels).toEqual(['jam', 'checkout']);
      const description = JSON.stringify(issue.body.description);
      expect(description).toContain(`"href":"https://jam.dev/c/${payload.jamId}"`);
      expect(description).toContain('Captured on: ');
      expect(description).toContain(
        'Chrome 154.0 on macOS (arm) 27.0.0, screen 1678x997, network 4g',
      );
      expect(description).not.toContain('recording.webm');

      expect((await jamRow(payload.jamId)).state).toBe('linked');
      const comment = jamCalls.find((call) => call.tool === 'createComment');
      expect(comment).toEqual({
        tool: 'createComment',
        args: {
          jamId: payload.jamId,
          body: `Tracked in Weaver as ${key}: http://localhost:5173/issues/${key}`,
        },
        authorization: 'Bearer jam_pat_e2e',
      });

      const panel = await as(tokens.reporter).get(`${route}/issues/${key}/jams`).expect(200);
      expect(panel.body.items).toHaveLength(1);
      expect(panel.body.items[0].link).toMatchObject({ source: 'inbox', backlinkState: 'posted' });

      await as()
        .post(`${route}/inbox/${payload.jamId}/create-issue`)
        .send({ projectKey: 'JAM' })
        .expect(409);
    });

    it('makes the triager the reporter when the Jam author cannot report in the project', async () => {
      const payload = jamCreated({
        author: { email: people.viewer.email, name: people.viewer.name },
      });
      await sendWebhook(payload).expect(200);
      const created = await as(tokens.reporter)
        .post(`${route}/inbox/${payload.jamId}/create-issue`)
        .send({ projectKey: 'JAM', summary: 'Viewer found a bug' })
        .expect(201);
      expect(created.body.issue.reporterId).toBe(ids.reporter);
    });

    it('refuses to create an issue in a project the triager cannot write to, and leaves the Jam in the inbox', async () => {
      const payload = jamCreated();
      await sendWebhook(payload).expect(200);
      await as(tokens.reporter)
        .post(`${route}/inbox/${payload.jamId}/create-issue`)
        .send({ projectKey: 'PRIV' })
        .expect(403);
      await as(tokens.viewer)
        .post(`${route}/inbox/${payload.jamId}/create-issue`)
        .send({ projectKey: 'JAM' })
        .expect(403);
      expect((await jamRow(payload.jamId)).state).toBe('new');
    });

    it('dismisses and restores a Jam', async () => {
      const payload = jamCreated();
      await sendWebhook(payload).expect(200);
      await as().post(`${route}/inbox/${payload.jamId}/dismiss`).expect(200);
      const dismissed = await as().get(`${route}/inbox?state=dismissed`).expect(200);
      expect(dismissed.body.items.map((jam: { jamId: string }) => jam.jamId)).toContain(
        payload.jamId,
      );
      await as().post(`${route}/inbox/${payload.jamId}/dismiss`).expect(409);
      await as().post(`${route}/inbox/${payload.jamId}/restore`).expect(200);
      expect((await jamRow(payload.jamId)).state).toBe('new');
    });
  });

  describe('issue links', () => {
    it('attaches a Jam Weaver has not received by fetching it from Jam, then unlinks it back to the inbox', async () => {
      const key = await createIssue('JAM', 'Attach target');
      const payload = jamCreated();
      jamDirectory.set(payload.jamId, directoryEntry(payload));

      const attached = await as(tokens.reporter)
        .post(`${route}/issues/${key}/jams`)
        .send({ jamUrl: `https://jam.dev/c/${payload.jamId}?s=mcp` })
        .expect(201);
      expect(attached.body.jam).toMatchObject({
        jamId: payload.jamId,
        receivedVia: 'manual',
        originalUrl: null,
      });
      expect(attached.body.jam.systemInfo.screen).toEqual({ width: 1440, height: 900 });
      await as(tokens.reporter)
        .post(`${route}/issues/${key}/jams`)
        .send({ jamId: payload.jamId })
        .expect(200);

      await as(tokens.reporter).delete(`${route}/issues/${key}/jams/${payload.jamId}`).expect(200);
      await as(tokens.reporter).delete(`${route}/issues/${key}/jams/${payload.jamId}`).expect(404);
      expect((await jamRow(payload.jamId)).state).toBe('new');
      const panel = await as().get(`${route}/issues/${key}/jams`).expect(200);
      expect(panel.body.items).toEqual([]);
    });

    it('refuses a Jam from another workspace, an unknown Jam, and a link that is not a Jam', async () => {
      const key = await createIssue('JAM', 'Attach refusals');
      const foreign = jamCreated({ teamId: otherTeamId });
      jamDirectory.set(foreign.jamId, directoryEntry(foreign));
      await as().post(`${route}/issues/${key}/jams`).send({ jamUrl: foreign.jamUrl }).expect(400);
      await as().post(`${route}/issues/${key}/jams`).send({ jamId: randomUUID() }).expect(404);
      await as()
        .post(`${route}/issues/${key}/jams`)
        .send({ jamUrl: `https://evil.example.test/c/${randomUUID()}` })
        .expect(400);
      jamDirectory.delete(foreign.jamId);
    });

    it('applies project access: viewers read, outsiders get nothing', async () => {
      const key = await createIssue('JAM', 'Access target');
      const privateKey = await createIssue('PRIV', 'Private target');
      const payload = jamCreated();
      await sendWebhook(payload).expect(200);

      await as(tokens.viewer).get(`${route}/issues/${key}/jams`).expect(200);
      await as(tokens.viewer)
        .post(`${route}/issues/${key}/jams`)
        .send({ jamId: payload.jamId })
        .expect(403);
      await as(tokens.reporter).get(`${route}/issues/${privateKey}/jams`).expect(403);
      await as(tokens.reporter)
        .post(`${route}/issues/${privateKey}/jams`)
        .send({ jamId: payload.jamId })
        .expect(403);
      expect((await jamRow(payload.jamId)).state).toBe('new');
    });
  });

  describe('Jam availability', () => {
    it('keeps a backlink pending while Jam is down and posts it on retry', async () => {
      const payload = jamCreated();
      await sendWebhook(payload).expect(200);
      jamMode = 'down';
      const created = await as()
        .post(`${route}/inbox/${payload.jamId}/create-issue`)
        .send({ projectKey: 'JAM' })
        .expect(201);
      expect(created.body.backlinkState).toBe('pending');
      const [link] = await dataSource.query(
        `SELECT backlink_attempts, backlink_next_attempt_at > now() AS deferred FROM "${schemaName}".jam_issue_links WHERE jam_id = $1`,
        [payload.jamId],
      );
      expect(link).toEqual({ backlink_attempts: 1, deferred: true });

      jamMode = 'ok';
      const retried = await as().post(`${route}/backlinks/retry`).expect(200);
      expect(retried.body.posted).toBeGreaterThanOrEqual(1);
      const [after] = await dataSource.query(
        `SELECT backlink_state FROM "${schemaName}".jam_issue_links WHERE jam_id = $1`,
        [payload.jamId],
      );
      expect(after.backlink_state).toBe('posted');
    });

    it('reports a rejected token and clears it once the connection verifies', async () => {
      jamMode = 'unauthorized';
      await as().post(`${route}/connection/verify`).expect(502);
      const broken = await as().get(`${route}/connection`).expect(200);
      expect(broken.body.connectionError.message).toContain('rejected the access token');

      jamMode = 'ok';
      const seeded = jamCreated();
      jamDirectory.set(seeded.jamId, directoryEntry(seeded));
      const verified = await as().post(`${route}/connection/verify`).expect(200);
      expect(verified.body).toMatchObject({ ok: true, workspaceMatches: true });
      const healthy = await as().get(`${route}/connection`).expect(200);
      expect(healthy.body).toMatchObject({
        connectionError: null,
        tokenConfigured: true,
        webhookSecretConfigured: true,
        workspaceId: teamId,
        webhookUrl: `http://localhost:3000/api/v1/plugin-routes/@weaver~plugin-jam/webhook/${tenantId}`,
      });
      expect(JSON.stringify(healthy.body)).not.toContain('jam_pat_e2e');
      jamDirectory.delete(seeded.jamId);
    });

    it('syncs Jams the webhook missed, once', async () => {
      const missed = [jamCreated(), jamCreated({ origin: 'recording_link' })];
      for (const payload of missed) jamDirectory.set(payload.jamId, directoryEntry(payload));
      const first = await as(tokens.reporter).post(`${route}/sync`).expect(200);
      expect(first.body.imported).toBeGreaterThanOrEqual(2);
      for (const payload of missed) {
        expect(await jamRow(payload.jamId)).toMatchObject({
          received_via: 'sync',
          state: 'new',
          original_url: null,
        });
      }
      const second = await as(tokens.reporter).post(`${route}/sync`).expect(200);
      expect(second.body.imported).toBe(0);
    });

    it('needs jam.admin for the connection', async () => {
      await as(tokens.reporter).get(`${route}/connection`).expect(403);
    });
  });

  it('removes its tables on confirmed uninstall', async () => {
    await as().post('/api/v1/plugins/uninstall').send({ pluginId }).expect(400);
    await as()
      .post('/api/v1/plugins/uninstall')
      .send({ pluginId, confirmDataDeletion: true })
      .expect(204);
    const [table] = await dataSource.query(
      `SELECT to_regclass('"${schemaName}".jam_items') AS name`,
    );
    expect(table.name).toBeNull();
    expect(ownerId).toBeTruthy();
  });
});
