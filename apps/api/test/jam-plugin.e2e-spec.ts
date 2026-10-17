import { createHmac, randomBytes, randomUUID } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import Redis from 'ioredis';
import { AppModule } from '../src/app.module';
import { TenantConnectionProvider } from '../src/core/tenant';
import { PluginContextFactory } from '../src/plugins/plugin-context.factory';
import { readLimitedResponseText } from '../src/core/security/outbound-http';

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
  const jamEvents = new Map<string, { console: unknown[]; network: unknown[] }>();
  const jamTranscripts = new Map<string, string>();
  const jamDownTools = new Set<string>();
  let makeRequestSpy: jest.SpyInstance;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
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
    await configure();

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

  beforeEach(async () => {
    jamMode = 'ok';
    jamCalls.length = 0;
    jamDownTools.clear();
    // Unauthenticated requests, webhooks included, share 30 per minute per address. This suite
    // sends more than that from one address, so each test starts with a fresh window.
    const limiter = new Redis({
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT),
      maxRetriesPerRequest: 1,
    });
    const keys = await limiter.keys(`${process.env.RATE_LIMIT_PREFIX}:*`);
    if (keys.length) await limiter.del(...keys);
    await limiter.quit();
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

  async function configure(overrides: Record<string, unknown> = {}) {
    await as()
      .patch('/api/v1/plugins/settings')
      .send({
        pluginId,
        settings: {
          jamWorkspaceId: teamId,
          jamApiToken: 'jam_pat_e2e',
          jamAccessExpiresOn: '2099-01-01',
          jamWebhookSecret: webhookSecret,
          recordingLinkUrl: 'https://recorder.jam.dev/Tst1234',
          postBacklinkComments: true,
          showDebugSummary: true,
          showTranscript: true,
          embedPlayer: false,
          notifyJamOnResolve: false,
          autoCreateHourlyLimit: 20,
          ...overrides,
        },
      })
      .expect(200);
  }

  async function fakeJam(body: any, options: any) {
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
    if (jamMode === 'down' || jamDownTools.has(tool))
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
      case 'getConsoleLogs':
      case 'getNetworkRequests': {
        const events =
          jamEvents.get(args.jamId)?.[tool === 'getConsoleLogs' ? 'console' : 'network'] ?? [];
        result = text({
          total: events.length,
          returned: events.length,
          hasMore: false,
          nextCursor: null,
          events,
        });
        break;
      }
      case 'getVideoTranscript': {
        // Jam keeps a WebVTT transcript only for video Jams recorded with the microphone on.
        const transcript = jamTranscripts.get(args.jamId);
        result = transcript
          ? { content: [{ type: 'text', text: transcript }] }
          : {
              content: [{ type: 'text', text: 'No transcript is available for this Jam' }],
              isError: true,
            };
        break;
      }
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
    // The same reader and 1 MB cap as PluginContextFactory.makeRequest.
    const data = await readLimitedResponseText(new Response(sse), 1024 * 1024);
    return {
      status: 200,
      data: options?.responseType === 'text' ? data : null,
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

    it("ignores Jam's description placeholder", async () => {
      const payload = jamCreated({ title: '', description: 'Write a description or @ to mention' });
      await sendWebhook(payload).expect(200);
      expect(await jamRow(payload.jamId)).toMatchObject({ title: null, description: null });
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

      jamCalls.length = 0;
      await as(tokens.reporter).delete(`${route}/issues/${key}/jams/${payload.jamId}`).expect(200);
      // The "Tracked in Weaver" comment stays on the Jam, so unlinking says the link is gone.
      let unlinked: (typeof jamCalls)[number] | undefined;
      for (let attempt = 0; attempt < 40 && !unlinked; attempt += 1) {
        unlinked = jamCalls.find(
          (call) =>
            call.tool === 'createComment' && String(call.args.body).startsWith('No longer tracked'),
        );
        if (!unlinked) await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(unlinked?.args).toEqual({
        jamId: payload.jamId,
        body: `No longer tracked in Weaver as ${key}: http://localhost:5173/issues/${key}`,
      });
      await as(tokens.reporter).delete(`${route}/issues/${key}/jams/${payload.jamId}`).expect(404);
      expect(jamCalls.filter((call) => call.tool === 'createComment')).toHaveLength(1);
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

  describe('recording requests', () => {
    function requestedJam(reference: string, overrides: Record<string, unknown> = {}) {
      return jamCreated({
        origin: 'recording_link',
        originalUrl: undefined,
        title: 'Show me',
        recordingLink: {
          publicId: 'Tst1234',
          type: 'reusable',
          description: 'Weaver requests',
          reference,
          submitterComment: 'It breaks right after I press pay.',
        },
        ...overrides,
      });
    }

    async function newRequest(issueKey: string, token = tokens.reporter) {
      const created = await as(token)
        .post(`${route}/issues/${issueKey}/recording-requests`)
        .send({ title: 'Show me', expiresInDays: 7 })
        .expect(201);
      const reference = new URL(created.body.url).searchParams.get('jam-reference')!;
      return { id: created.body.id as string, url: created.body.url as string, reference };
    }

    it('attaches a Jam recorded through a request to the requesting issue, whatever key the link shows', async () => {
      const key = await createIssue('JAM', 'Payment fails');
      const request = await newRequest(key);
      expect(request.url.startsWith('https://recorder.jam.dev/Tst1234?')).toBe(true);
      expect(new URL(request.url).searchParams.get('jam-title')).toBe('Show me');
      expect(request.reference).toMatch(
        new RegExp(`^http://localhost:5173/issues/${key}\\?jr=${request.id}\\.[A-Za-z0-9_-]{22}$`),
      );

      const listed = await as(tokens.viewer)
        .get(`${route}/issues/${key}/recording-requests`)
        .expect(200);
      expect(listed.body.items).toEqual([
        expect.objectContaining({ id: request.id, status: 'active', url: request.url }),
      ]);

      // The issue key in the reference is cosmetic; the signed request decides.
      const payload = requestedJam(
        request.reference.replace(`/issues/${key}?`, '/issues/WRONG-1?'),
      );
      await sendWebhook(payload).expect(200);

      expect((await jamRow(payload.jamId)).state).toBe('linked');
      const panel = await as().get(`${route}/issues/${key}/jams`).expect(200);
      expect(panel.body.items[0]).toMatchObject({
        jamId: payload.jamId,
        link: { source: 'recording_request', backlinkState: 'posted' },
      });
      expect(panel.body.display.recordingRequests).toBe(true);
      const [counted] = await dataSource.query(
        `SELECT jams_received FROM "${schemaName}".jam_recording_requests WHERE id = $1`,
        [request.id],
      );
      expect(counted.jams_received).toBe(1);
      const [comment] = await dataSource.query(
        `SELECT c.author_id, c.body::text AS body FROM "${schemaName}".comments c
           JOIN "${schemaName}".issues i ON i.id = c.issue_id WHERE i.key = $1`,
        [key],
      );
      expect(comment.author_id).toBe(ids.reporter);
      expect(comment.body).toContain('A Jam was recorded for this request');
      expect(comment.body).toContain('It breaks right after I press pay.');
    });

    it('sends a tampered, revoked, or expired request to the inbox with the reason', async () => {
      const key = await createIssue('JAM', 'Reference refusals');
      const tampered = await newRequest(key);
      const forged = requestedJam(
        tampered.reference.replace(/.$/, (last) => (last === 'A' ? 'B' : 'A')),
      );
      await sendWebhook(forged).expect(200);
      expect(await jamRow(forged.jamId)).toMatchObject({ state: 'new', flag: 'invalid_reference' });

      const revoked = await newRequest(key);
      await as(tokens.viewer)
        .delete(`${route}/issues/${key}/recording-requests/${revoked.id}`)
        .expect(403);
      await as(tokens.reporter)
        .delete(`${route}/issues/${key}/recording-requests/${revoked.id}`)
        .expect(200);
      const afterRevoke = requestedJam(revoked.reference);
      await sendWebhook(afterRevoke).expect(200);
      expect(await jamRow(afterRevoke.jamId)).toMatchObject({
        state: 'new',
        flag: 'request_revoked',
      });

      const expired = await newRequest(key);
      await dataSource.query(
        `UPDATE "${schemaName}".jam_recording_requests SET expires_at = now() - interval '1 day' WHERE id = $1`,
        [expired.id],
      );
      const late = requestedJam(expired.reference);
      await sendWebhook(late).expect(200);
      expect(await jamRow(late.jamId)).toMatchObject({ state: 'new', flag: 'request_expired' });
    });

    it('needs a reusable recording link and write access', async () => {
      const key = await createIssue('JAM', 'Request permissions');
      await as(tokens.viewer)
        .post(`${route}/issues/${key}/recording-requests`)
        .send({})
        .expect(403);
      await configure({ recordingLinkUrl: '' });
      await as(tokens.reporter)
        .post(`${route}/issues/${key}/recording-requests`)
        .send({})
        .expect(400);
      await configure();
    });
  });

  describe('routing rules', () => {
    afterEach(async () => {
      await dataSource.query(`DELETE FROM "${schemaName}".jam_routing_rules`);
    });

    it('creates issues for matching Jams up to the hourly limit, then suggests the project', async () => {
      const rule = await as()
        .post(`${route}/rules`)
        .send({
          name: 'Shop bugs',
          match: { urlHost: '*.example.test' },
          action: 'create',
          projectKey: 'JAM',
          priority: 'high',
          labels: ['jam', 'shop'],
          hourlyLimit: 2,
        })
        .expect(201);
      expect(rule.body).toMatchObject({
        name: 'Shop bugs',
        projectKey: 'JAM',
        action: 'create',
        position: 1,
      });

      const jams = [jamCreated(), jamCreated(), jamCreated()];
      for (const payload of jams) await sendWebhook(payload).expect(200);

      for (const payload of jams.slice(0, 2)) {
        const [link] = await dataSource.query(
          `SELECT l.link_source, i.priority, i.labels, i.reporter_id FROM "${schemaName}".jam_issue_links l
             JOIN "${schemaName}".issues i ON i.id = l.issue_id WHERE l.jam_id = $1`,
          [payload.jamId],
        );
        expect(link).toMatchObject({
          link_source: 'rule',
          priority: 'high',
          reporter_id: ids.reporter,
        });
      }
      const over = await as().get(`${route}/inbox`).expect(200);
      expect(
        over.body.items.find((jam: { jamId: string }) => jam.jamId === jams[2].jamId),
      ).toMatchObject({
        flag: 'rate_limited',
        suggestedProjectKey: 'JAM',
      });
    });

    it('applies the first matching rule in order, and an inbox rule only suggests', async () => {
      const create = await as()
        .post(`${route}/rules`)
        .send({
          name: 'Create shop',
          match: { urlHost: 'shop.example.test' },
          action: 'create',
          projectKey: 'JAM',
        })
        .expect(201);
      const suggest = await as()
        .post(`${route}/rules`)
        .send({
          name: 'Suggest extension',
          match: { origin: 'extension_chrome' },
          action: 'inbox',
          projectKey: 'PRIV',
        })
        .expect(201);

      const first = jamCreated();
      await sendWebhook(first).expect(200);
      expect((await jamRow(first.jamId)).state).toBe('linked');

      const reordered = await as()
        .post(`${route}/rules/reorder`)
        .send({ ids: [suggest.body.id, create.body.id] })
        .expect(200);
      expect(reordered.body.items.map((rule: { id: string }) => rule.id)).toEqual([
        suggest.body.id,
        create.body.id,
      ]);
      const second = jamCreated();
      await sendWebhook(second).expect(200);
      const row = await jamRow(second.jamId);
      expect(row.state).toBe('new');
      const inbox = await as().get(`${route}/inbox`).expect(200);
      expect(
        inbox.body.items.find((jam: { jamId: string }) => jam.jamId === second.jamId)
          .suggestedProjectKey,
      ).toBe('PRIV');

      await as().patch(`${route}/rules/${suggest.body.id}`).send({ enabled: false }).expect(200);
      const third = jamCreated({ originalUrl: 'https://elsewhere.test/page' });
      await sendWebhook(third).expect(200);
      expect(await jamRow(third.jamId)).toMatchObject({ state: 'new', suggested_project_id: null });
    });

    it('matches a Jam folder through Jam', async () => {
      await as()
        .post(`${route}/rules`)
        .send({
          name: 'Folder',
          match: { folder: 'Client bugs' },
          action: 'create',
          projectKey: 'JAM',
        })
        .expect(201);
      const payload = jamCreated({ originalUrl: 'https://elsewhere.test/a' });
      jamDirectory.set(
        payload.jamId,
        directoryEntry(payload, {
          folder: { id: randomUUID(), shortId: 'ab12', name: 'Client Bugs' },
        }),
      );
      await sendWebhook(payload).expect(200);
      expect((await jamRow(payload.jamId)).state).toBe('linked');
      expect(
        jamCalls.some((call) => call.tool === 'getDetails' && call.args.jamId === payload.jamId),
      ).toBe(true);
      jamDirectory.delete(payload.jamId);
    });

    it('matches any of several hosts and a path prefix at a segment boundary', async () => {
      await as()
        .post(`${route}/rules`)
        .send({
          name: 'Client carts',
          match: { urlHosts: ['shop.example.test', 'staging.example.test'], pathPrefix: '/cart' },
          action: 'create',
          projectKey: 'JAM',
        })
        .expect(201);
      const cases: Array<[string, string]> = [
        ['https://staging.example.test/cart/step-2?coupon=x', 'linked'],
        ['https://shop.example.test/cart', 'linked'],
        ['https://shop.example.test/cartoon', 'new'],
        ['https://shop.example.test/about', 'new'],
        ['https://other.example.test/cart', 'new'],
      ];
      for (const [originalUrl, state] of cases) {
        const payload = jamCreated({ originalUrl });
        await sendWebhook(payload).expect(200);
        expect([originalUrl, (await jamRow(payload.jamId)).state]).toEqual([originalUrl, state]);
      }
    });

    it('routes a host to one project, unless paths split it', async () => {
      await as()
        .post(`${route}/rules`)
        .send({
          name: 'Client site',
          match: { urlHosts: ['client.example.test', 'www.client.example.test'] },
          action: 'inbox',
          projectKey: 'JAM',
        })
        .expect(201);
      const clash = await as()
        .post(`${route}/rules`)
        .send({
          name: 'Elsewhere',
          match: { urlHosts: ['www.client.example.test'] },
          action: 'inbox',
          projectKey: 'PRIV',
        })
        .expect(409);
      expect(clash.body.message).toContain(
        'www.client.example.test already routes to JAM in the rule "Client site"',
      );
      const admin = await as()
        .post(`${route}/rules`)
        .send({
          name: 'Client admin',
          match: { urlHosts: ['client.example.test'], pathPrefix: '/admin' },
          action: 'inbox',
          projectKey: 'PRIV',
        })
        .expect(201);
      await as()
        .post(`${route}/rules`)
        .send({
          name: 'Same project',
          match: { urlHosts: ['client.example.test'] },
          action: 'create',
          projectKey: 'JAM',
        })
        .expect(201);
      await as()
        .patch(`${route}/rules/${admin.body.id}`)
        .send({ match: { urlHosts: ['client.example.test'] } })
        .expect(409);
    });

    it('validates hosts and paths, and accepts a single host string', async () => {
      const base = { name: 'R', action: 'inbox', projectKey: 'JAM' };
      await as()
        .post(`${route}/rules`)
        .send({ ...base, match: { pathPrefix: 'cart' } })
        .expect(400);
      await as()
        .post(`${route}/rules`)
        .send({ ...base, match: { pathPrefix: '/cart?x=1' } })
        .expect(400);
      const tooMany = Array.from({ length: 21 }, (_, index) => `h${index}.example.test`);
      await as()
        .post(`${route}/rules`)
        .send({ ...base, match: { urlHosts: tooMany } })
        .expect(400);
      const legacy = await as()
        .post(`${route}/rules`)
        .send({ ...base, match: { urlHost: 'Shop.Example.test, staging.example.test' } })
        .expect(201);
      expect(legacy.body.match).toEqual({
        urlHosts: ['shop.example.test', 'staging.example.test'],
      });
    });

    it('validates rules and needs jam.admin and project write access', async () => {
      const rule = {
        name: 'R',
        match: { urlHost: 'shop.example.test' },
        action: 'create',
        projectKey: 'JAM',
      };
      await as(tokens.reporter).post(`${route}/rules`).send(rule).expect(403);
      await as()
        .post(`${route}/rules`)
        .send({ ...rule, match: {} })
        .expect(400);
      const badHost = await as()
        .post(`${route}/rules`)
        .send({ ...rule, match: { urlHosts: 'shop.example.test, not a host' } })
        .expect(400);
      expect(badHost.body.message).toBe(
        '"not a host" is not a host name. Use names such as shop.example.com or *.example.com',
      );
      const tooMany = await as()
        .post(`${route}/rules`)
        .send({
          ...rule,
          match: { urlHosts: Array.from({ length: 21 }, (_, i) => `h${i}.example.test`) },
        })
        .expect(400);
      expect(tooMany.body.message).toBe('A rule can match at most 20 page hosts');
      await as()
        .post(`${route}/rules`)
        .send({ ...rule, action: 'delete' })
        .expect(400);
      await as()
        .post(`${route}/rules`)
        .send({ ...rule, projectKey: 'NOPE' })
        .expect(404);
    });
  });

  describe('debug summary', () => {
    it('shows counts, console errors, and failed requests without bodies, headers, or query strings', async () => {
      const payload = jamCreated();
      await sendWebhook(payload).expect(200);
      const created = await as()
        .post(`${route}/inbox/${payload.jamId}/create-issue`)
        .send({ projectKey: 'JAM' })
        .expect(201);
      const key = created.body.issue.key;
      jamDirectory.set(
        payload.jamId,
        directoryEntry(payload, {
          eventsSummary: {
            total: 13,
            console: { total: 3, level: { error: 2, warn: 1 } },
            network: { total: 10, httpStatus: { '200': 8, '404': 1, '500': 1 } },
          },
        }),
      );
      jamEvents.set(payload.jamId, {
        console: [
          {
            event_type: 'console',
            console_level: 'error',
            console_message:
              'TypeError: total is undefined at https://shop.example.test/checkout?token=abc123',
            ts: '2026-10-16 19:48:58.000',
          },
        ],
        network: [
          {
            event_type: 'network',
            network_method: 'POST',
            network_host: 'api.example.test',
            network_path: '/orders',
            network_url: 'https://api.example.test/orders?session=s3cr3t',
            network_status: 500,
            network_duration_ms: 123.4,
            network_request_body: '{"card":"4111111111111111"}',
            network_response_body: 'internal secret body',
            network_request_headers: { Authorization: 'Bearer live-abc' },
          },
        ],
      });

      const summary = await as(tokens.viewer)
        .get(`${route}/issues/${key}/jams/${payload.jamId}/summary`)
        .expect(200);
      expect(summary.body.console).toMatchObject({ total: 3, levels: { error: 2, warn: 1 } });
      expect(summary.body.console.errors[0].message).toBe(
        'TypeError: total is undefined at https://shop.example.test/checkout?token=[redacted]',
      );
      expect(summary.body.network).toMatchObject({ total: 10, failed: 2 });
      expect(summary.body.network.failures[0]).toEqual({
        method: 'POST',
        host: 'api.example.test',
        path: '/orders',
        status: 500,
        durationMs: 123,
      });
      const text = JSON.stringify(summary.body);
      for (const secret of ['s3cr3t', 'abc123', '4111', 'internal secret body', 'live-abc']) {
        expect(text).not.toContain(secret);
      }

      const callsBefore = jamCalls.length;
      await as().get(`${route}/issues/${key}/jams/${payload.jamId}/summary`).expect(200);
      expect(jamCalls.length).toBe(callsBefore);

      const other = await createIssue('JAM', 'Not linked');
      await as().get(`${route}/issues/${other}/jams/${payload.jamId}/summary`).expect(404);
      await configure({ showDebugSummary: false });
      await as().get(`${route}/issues/${key}/jams/${payload.jamId}/summary`).expect(404);
      await configure();
      jamDirectory.delete(payload.jamId);
    });

    describe('transcript', () => {
      const linked: string[] = [];
      const transcriptCalls = () =>
        jamCalls.filter((call) => call.tool === 'getVideoTranscript').length;
      const vttCue = (index: number) =>
        `00:${String(Math.floor(index / 60) % 60).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}.000 --> 00:59:59.000\n` +
        `The reporter repeats what they tried, attempt number ${index}.`;

      async function linkedJam(overrides: Record<string, unknown> = {}) {
        const payload = jamCreated(overrides);
        await sendWebhook(payload).expect(200);
        const created = await as()
          .post(`${route}/inbox/${payload.jamId}/create-issue`)
          .send({ projectKey: 'JAM' })
          .expect(201);
        jamDirectory.set(payload.jamId, directoryEntry(payload));
        linked.push(payload.jamId);
        return {
          jamId: payload.jamId,
          summaryUrl: `${route}/issues/${created.body.issue.key}/jams/${payload.jamId}/summary`,
        };
      }

      afterEach(async () => {
        for (const jamId of linked.splice(0)) {
          jamDirectory.delete(jamId);
          jamTranscripts.delete(jamId);
        }
        await configure();
      });

      it('adds what the reporter said as plain text with start times, cached with the summary', async () => {
        const jam = await linkedJam();
        jamTranscripts.set(
          jam.jamId,
          [
            'WEBVTT',
            'Kind: captions',
            'Language: en',
            '',
            'NOTE Generated captions',
            '',
            '1',
            '00:00:01.000 --> 00:00:04.200 align:start position:0%',
            '<v Riley>So I click <b>checkout</b>',
            'and nothing happens.</v>',
            '',
            '00:07.500 --> 00:09.000',
            '<c.yellow>It says</c> &lt;script&gt;alert(1)&lt;/script&gt; &amp; <00:00:08.000>spins',
            '',
            '01:02:03.000 --> 01:02:05.000',
            '<script>alert(2)</script>Bye',
            '',
          ].join('\r\n'),
        );

        const summary = await as(tokens.viewer).get(jam.summaryUrl).expect(200);
        expect(summary.body.transcript).toEqual({
          status: 'available',
          truncated: false,
          cues: [
            { startMs: 1000, text: 'So I click checkout and nothing happens.' },
            // Escaped characters become literal text; the panel never renders cues as HTML.
            { startMs: 7500, text: 'It says <script>alert(1)</script> & spins' },
            { startMs: 3_723_000, text: 'alert(2)Bye' },
          ],
        });
        expect(jamCalls.find((call) => call.tool === 'getVideoTranscript')?.args).toEqual({
          jamId: jam.jamId,
        });
        expect(summary.body.console).toBeDefined();

        const callsBefore = jamCalls.length;
        await as().get(jam.summaryUrl).expect(200);
        expect(jamCalls.length).toBe(callsBefore);

        // Turned off: hidden from the cached summary, and not fetched on refresh.
        await configure({ showTranscript: false });
        const hidden = await as().get(jam.summaryUrl).expect(200);
        expect(hidden.body).not.toHaveProperty('transcript');
        expect(hidden.body.network).toBeDefined();
        await as().get(`${jam.summaryUrl}?refresh=true`).expect(200);
        expect(transcriptCalls()).toBe(1);

        // Back on: the summary cached while it was off has no transcript, so Jam is asked again.
        await configure();
        const again = await as().get(jam.summaryUrl).expect(200);
        expect(again.body.transcript.status).toBe('available');
        expect(transcriptCalls()).toBe(2);
      });

      it('says there is none for a Jam without speech, and skips Jam for screenshots and replays', async () => {
        const noMicrophone = await linkedJam();
        const none = await as().get(noMicrophone.summaryUrl).expect(200);
        expect(none.body.transcript).toEqual({ status: 'none', cues: [], truncated: false });

        const silent = await linkedJam();
        jamTranscripts.set(silent.jamId, 'WEBVTT\n\n');
        const empty = await as().get(silent.summaryUrl).expect(200);
        expect(empty.body.transcript.status).toBe('none');
        expect(transcriptCalls()).toBe(2);

        for (const type of ['screenshot', 'sessionReplay']) {
          const jam = await linkedJam({ type });
          const summary = await as().get(jam.summaryUrl).expect(200);
          expect(summary.body.transcript).toEqual({ status: 'none', cues: [], truncated: false });
        }
        expect(transcriptCalls()).toBe(2);
      });

      it('keeps the summary when the transcript is long, too long, or not sent', async () => {
        const long = await linkedJam();
        jamTranscripts.set(
          long.jamId,
          `WEBVTT\n\n${Array.from({ length: 600 }, (_, index) => vttCue(index)).join('\n\n')}`,
        );
        const shortened = await as().get(long.summaryUrl).expect(200);
        expect(shortened.body.transcript.status).toBe('available');
        expect(shortened.body.transcript.truncated).toBe(true);
        const kept = shortened.body.transcript.cues as Array<{ startMs: number; text: string }>;
        expect(kept.length).toBeGreaterThan(100);
        expect(kept.length).toBeLessThan(600);
        expect(kept.reduce((total, cue) => total + cue.text.length, 0)).toBeLessThanOrEqual(20_000);
        expect(kept[1]).toEqual({
          startMs: 1000,
          text: 'The reporter repeats what they tried, attempt number 1.',
        });

        // Over the plugin HTTP client's 1 MB reply cap.
        const huge = await linkedJam();
        jamTranscripts.set(
          huge.jamId,
          `WEBVTT\n\n${Array.from({ length: 15_000 }, (_, index) => vttCue(index)).join('\n\n')}`,
        );
        const tooLong = await as().get(huge.summaryUrl).expect(200);
        expect(tooLong.body.transcript).toEqual({ status: 'too_long', cues: [], truncated: false });
        expect(tooLong.body.console).toBeDefined();
        const callsBefore = jamCalls.length;
        await as().get(huge.summaryUrl).expect(200);
        expect(jamCalls.length).toBe(callsBefore);

        // The transcript call fails alone: the rest of the summary shows, and nothing is cached.
        const flaky = await linkedJam();
        jamTranscripts.set(
          flaky.jamId,
          JSON.stringify({ transcript: 'WEBVTT\n\n00:01.000 --> 00:02.000\nHello' }),
        );
        jamDownTools.add('getVideoTranscript');
        const unavailable = await as().get(flaky.summaryUrl).expect(200);
        expect(unavailable.body.transcript).toEqual({
          status: 'unavailable',
          cues: [],
          truncated: false,
        });
        expect(unavailable.body.network).toBeDefined();
        jamDownTools.clear();
        const recovered = await as().get(flaky.summaryUrl).expect(200);
        expect(recovered.body.transcript.cues).toEqual([{ startMs: 1000, text: 'Hello' }]);

        // Jam unreachable altogether: the summary is unavailable, as before.
        jamMode = 'down';
        await as().get(`${flaky.summaryUrl}?refresh=true`).expect(502);
      });
    });
  });

  describe('resolve comments', () => {
    it('comments on linked Jams, mentioning the author, when the issue reaches a done status', async () => {
      await configure({ notifyJamOnResolve: true });
      const payload = jamCreated();
      await sendWebhook(payload).expect(200);
      const created = await as()
        .post(`${route}/inbox/${payload.jamId}/create-issue`)
        .send({ projectKey: 'JAM' })
        .expect(201);
      const key = created.body.issue.key;
      const authorId = randomUUID();
      jamDirectory.set(
        payload.jamId,
        directoryEntry(payload, {
          author: { id: authorId, name: 'Riley Reporter', email: people.reporter.email },
        }),
      );
      // Follow the project's workflow transitions from the current status to a done status.
      const workflow = (await as().get('/api/v1/projects/JAM/workflow').expect(200)).body as {
        transitions: Array<{
          fromStatusId: string | null;
          toStatusId: string;
          toStatus: { name: string; category: string };
        }>;
      };
      let statusId = (await as().get(`/api/v1/issues/${key}`).expect(200)).body.statusId as string;
      const path: Array<{ id: string; name: string; category: string }> = [];
      const seen = new Set([statusId]);
      while (!path.length || path[path.length - 1].category !== 'done') {
        const next =
          workflow.transitions.find(
            (t) =>
              (t.fromStatusId === statusId || t.fromStatusId === null) &&
              t.toStatus.category === 'done',
          ) ??
          workflow.transitions.find(
            (t) =>
              (t.fromStatusId === statusId || t.fromStatusId === null) && !seen.has(t.toStatusId),
          );
        if (!next) throw new Error('No workflow path to a done status');
        path.push({
          id: next.toStatusId,
          name: next.toStatus.name,
          category: next.toStatus.category,
        });
        seen.add(next.toStatusId);
        statusId = next.toStatusId;
      }
      jamCalls.length = 0;
      for (const step of path)
        await as().patch(`/api/v1/issues/${key}`).send({ statusId: step.id }).expect(200);
      const done = path[path.length - 1];

      let comment: (typeof jamCalls)[number] | undefined;
      for (let attempt = 0; attempt < 40 && !comment; attempt += 1) {
        comment = jamCalls.find(
          (call) =>
            call.tool === 'createComment' && String(call.args.body).includes('was resolved'),
        );
        if (!comment) await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(comment?.args).toEqual({
        jamId: payload.jamId,
        body: `${key} was resolved in Weaver (${done.name}): http://localhost:5173/issues/${key} @[Riley Reporter](user:${authorId})`,
      });
      await configure();
      jamDirectory.delete(payload.jamId);
    });
  });

  it('removes its tables on confirmed uninstall', async () => {
    await as().post('/api/v1/plugins/uninstall').send({ pluginId }).expect(400);
    await as()
      .post('/api/v1/plugins/uninstall')
      .send({ pluginId, confirmDataDeletion: true })
      .expect(204);
    const [table] = await dataSource.query(
      `SELECT to_regclass('"${schemaName}".jam_items') AS items, to_regclass('"${schemaName}".jam_routing_rules') AS rules`,
    );
    expect(table).toEqual({ items: null, rules: null });
    expect(ownerId).toBeTruthy();
  });
});
