import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import type { PluginContext } from '@weaver/sdk';
import { InstalledPluginEntity } from '@weaver/db';
import { AppModule } from '../src/app.module';
import { TenantConnectionProvider, tenantStorage } from '../src/core/tenant';
import { EventDispatcherService } from '../src/modules/events';
import { PluginContextFactory } from '../src/plugins/plugin-context.factory';
import { PluginLoaderService } from '../src/plugins/plugin-loader.service';

// The core APIs an integration plugin calls from a public webhook route, where the plugin
// context has no request user: issues.create (issue-create capability) and addComment with an
// explicit actor. Both must take the same service paths as the HTTP routes.
describe('Plugin integration prerequisites (e2e)', () => {
  jest.setTimeout(30_000);
  const pluginId = '@weaver/plugin-integration-prereq-test';
  const ownerEmail = 'plugin-prereq-owner@example.com';
  const tenantSlug = 'plugin-prereq-e2e';
  const schemaName = 'tenant_plugin_prereq_e2e';
  const people = {
    reporter: { email: 'plugin-prereq-reporter@example.com', displayName: 'Riley Reporter' },
    projectViewer: {
      email: 'plugin-prereq-project-viewer@example.com',
      displayName: 'Pat Project Viewer',
    },
    tenantViewer: {
      email: 'plugin-prereq-tenant-viewer@example.com',
      displayName: 'Vic Tenant Viewer',
    },
    outsider: { email: 'plugin-prereq-outsider@example.com', displayName: 'Olu Outsider' },
  };
  const emails = [ownerEmail, ...Object.values(people).map(({ email }) => email)];

  let app: INestApplication;
  let dataSource: DataSource;
  let connections: TenantConnectionProvider;
  let contextFactory: PluginContextFactory;
  let pluginDirectory: string;
  let accessToken: string;
  let tenantId: string;
  let ownerId: string;
  const ids: Record<keyof typeof people, string> = {
    reporter: '',
    projectViewer: '',
    tenantViewer: '',
    outsider: '',
  };
  let triageStatusId: string;
  const events: Array<{ event: string; payload: Record<string, unknown> }> = [];
  let stopRecording: () => void;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');

    dataSource = app.get(DataSource);
    connections = app.get(TenantConnectionProvider);
    contextFactory = app.get(PluginContextFactory);
    await cleanupTestData();

    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: ownerEmail,
        password: 'password123',
        displayName: 'Owner Olivia',
        orgName: 'Plugin Prerequisites E2E',
        orgSlug: tenantSlug,
      })
      .expect(201);
    accessToken = registration.body.accessToken;
    tenantId = registration.body.tenantId;
    ownerId = registration.body.user.id;

    for (const [name, person] of Object.entries(people) as Array<
      [keyof typeof people, (typeof people)[keyof typeof people]]
    >) {
      const [row] = await dataSource.query(
        `INSERT INTO public.users (email, display_name) VALUES ($1, $2) RETURNING id`,
        [person.email, person.displayName],
      );
      ids[name] = row.id;
    }
    const tenantRoles: Array<[string, string]> = [
      [ids.reporter, 'member'],
      [ids.projectViewer, 'member'],
      [ids.tenantViewer, 'viewer'],
    ];
    for (const [userId, role] of tenantRoles) {
      await dataSource.query(
        `INSERT INTO public.tenant_memberships (tenant_id, user_id, role) VALUES ($1, $2, $3)`,
        [tenantId, userId, role],
      );
    }

    // A workflow whose initial status is not the default one, so the test can tell that the
    // plugin path resolved the project's workflow.
    const workflow = await authed().post('/api/v1/workflows').send({ name: 'Intake' }).expect(201);
    await authed()
      .post(`/api/v1/workflows/${workflow.body.id}/statuses`)
      .send({ name: 'Backlog', category: 'todo', color: '#64748b' })
      .expect(201);
    const triage = await authed()
      .post(`/api/v1/workflows/${workflow.body.id}/statuses`)
      .send({ name: 'Triage', category: 'todo', color: '#f59e0b', isInitial: true })
      .expect(201);
    triageStatusId = triage.body.id;

    await authed().post('/api/v1/projects').send({ name: 'Intake', key: 'INT' }).expect(201);
    await authed().patch('/api/v1/projects/INT').send({ workflowId: workflow.body.id }).expect(200);
    const projectRoles: Array<[string, string]> = [
      [ids.reporter, 'member'],
      [ids.projectViewer, 'viewer'],
      [ids.tenantViewer, 'member'],
    ];
    for (const [userId, role] of projectRoles) {
      await authed().post('/api/v1/projects/INT/members').send({ userId, role }).expect(201);
    }

    pluginDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'weaver-plugin-prereq-e2e-'));
    const manifestDirectory = path.join(pluginDirectory, 'integration-prereq-test');
    fs.mkdirSync(manifestDirectory);
    fs.writeFileSync(
      path.join(manifestDirectory, 'weaver-plugin.json'),
      JSON.stringify({
        id: pluginId,
        name: 'Integration Prerequisites Test',
        version: '0.1.0',
        type: 'app',
        scope: 'tenant',
        entrypoints: {},
        permissions: [],
        requires: { coreCapabilities: ['issue-create'] },
      }),
    );
    await app.get(PluginLoaderService).loadPlugins(pluginDirectory);
    await dataSource.getRepository(InstalledPluginEntity).save({
      tenantId,
      pluginId,
      version: '0.1.0',
      enabled: true,
      settings: {},
    });

    stopRecording = app
      .get(EventDispatcherService)
      .registerDomainDispatcher(async (event, payload) => {
        events.push({ event, payload });
      });
  });

  afterAll(async () => {
    stopRecording?.();
    if (connections) {
      await connections.closeAll();
    }
    if (dataSource?.isInitialized) {
      await cleanupTestData();
    }
    if (pluginDirectory) {
      fs.rmSync(pluginDirectory, { recursive: true, force: true });
    }
    if (app) {
      await app.close();
    }
  });

  beforeEach(() => {
    events.length = 0;
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

  function authed() {
    const server = app.getHttpServer();
    const withAuth = (test: request.Test) =>
      test.set('Authorization', `Bearer ${accessToken}`).set('X-Tenant-ID', tenantId);
    return {
      get: (url: string) => withAuth(request(server).get(url)),
      post: (url: string) => withAuth(request(server).post(url)),
      patch: (url: string) => withAuth(request(server).patch(url)),
    };
  }

  // A public webhook route builds its context with no user.
  function asWebhook<T>(callback: (context: PluginContext) => Promise<T>): Promise<T> {
    return tenantStorage.run({ tenantId, schemaName, slug: tenantSlug }, async () =>
      callback(await contextFactory.create(pluginId, {}, undefined)),
    );
  }

  async function issueCount(): Promise<number> {
    const [row] = await dataSource.query(
      `SELECT count(*)::int AS count FROM "${schemaName}".issues`,
    );
    return row.count;
  }

  describe('issues.create', () => {
    it('creates an issue as the named reporter through IssuesService', async () => {
      const created = await asWebhook((context) =>
        context.api.issues.create(
          'INT',
          {
            summary: 'Checkout button does nothing',
            description: {
              type: 'doc',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Captured with Jam' }] },
              ],
            },
            priority: 'high',
            labels: ['jam'],
          },
          { reporterId: ids.reporter },
        ),
      );

      expect(created).toEqual({
        id: expect.any(String),
        key: expect.stringMatching(/^INT-\d+$/),
        projectKey: 'INT',
        summary: 'Checkout button does nothing',
        statusId: triageStatusId,
        reporterId: ids.reporter,
        assigneeId: null,
        createdAt: expect.any(String),
      });

      const issue = await authed().get(`/api/v1/issues/${created.key}`).expect(200);
      expect(issue.body).toEqual(
        expect.objectContaining({
          reporterId: ids.reporter,
          statusId: triageStatusId,
          priority: 'high',
          labels: ['jam'],
        }),
      );

      const activity = await authed().get(`/api/v1/issues/${created.key}/activity`).expect(200);
      expect(activity.body).toEqual([
        expect.objectContaining({
          action: 'created',
          userId: ids.reporter,
          userDisplayName: people.reporter.displayName,
        }),
      ]);

      expect(events).toContainEqual({
        event: 'issue.created',
        payload: expect.objectContaining({
          issueKey: created.key,
          projectKey: 'INT',
          userId: ids.reporter,
        }),
      });
    });

    it('defaults the reporter to the request user on an authenticated route', async () => {
      const created = await tenantStorage.run(
        { tenantId, schemaName, slug: tenantSlug },
        async () => {
          const context = await contextFactory.create(
            pluginId,
            {},
            {
              id: ownerId,
              email: ownerEmail,
              displayName: 'Owner Olivia',
            },
          );
          return context.api.issues.create('INT', { summary: 'Created from the inbox' });
        },
      );

      expect(created.reporterId).toBe(ownerId);
      expect(created.statusId).toBe(triageStatusId);
    });

    it.each([
      ['a project viewer', 'projectViewer', 'Project membership is required'],
      [
        'a tenant viewer, whose role cannot create issues',
        'tenantViewer',
        'Missing permission: issues.create',
      ],
      ['someone outside the tenant', 'outsider', 'Tenant membership is required'],
    ] as const)('refuses %s as reporter and creates nothing', async (_label, person, message) => {
      const before = await issueCount();

      await expect(
        asWebhook((context) =>
          context.api.issues.create(
            'INT',
            { summary: 'Should not exist' },
            { reporterId: ids[person] },
          ),
        ),
      ).rejects.toThrow(message);

      expect(await issueCount()).toBe(before);
      expect(events.filter(({ event }) => event === 'issue.created')).toEqual([]);
    });

    it('applies custom field validation without consuming an issue number', async () => {
      const [{ issue_counter: counterBefore }] = await dataSource.query(
        `SELECT issue_counter FROM "${schemaName}".projects WHERE key = 'INT'`,
      );

      await expect(
        asWebhook((context) =>
          context.api.issues.create(
            'INT',
            { summary: 'Unknown field', customFields: { jam_severity: 'high' } },
            { reporterId: ids.reporter },
          ),
        ),
      ).rejects.toThrow('Unknown custom field "jam_severity"');

      const [{ issue_counter: counterAfter }] = await dataSource.query(
        `SELECT issue_counter FROM "${schemaName}".projects WHERE key = 'INT'`,
      );
      expect(counterAfter).toBe(counterBefore);
    });

    it('requires a reporter on a route with no user', async () => {
      await expect(
        asWebhook((context) => context.api.issues.create('INT', { summary: 'Anonymous' })),
      ).rejects.toThrow('requires an interactive user context or an explicit reporterId');
    });
  });

  describe('issues.addComment', () => {
    let issueKey: string;

    beforeAll(async () => {
      const issue = await authed()
        .post('/api/v1/projects/INT/issues')
        .send({ summary: 'Needs a reproduction' })
        .expect(201);
      issueKey = issue.body.key;
    });

    it('comments as the named author, emits comment.created, and notifies mentions', async () => {
      const body = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'mention', attrs: { id: ownerId, label: 'Owner Olivia' } },
              { type: 'text', text: ' a Jam recording arrived for this issue.' },
            ],
          },
        ],
      };

      const comment = await asWebhook((context) =>
        context.api.issues.addComment(issueKey, body, { authorId: ids.reporter }),
      );

      expect(comment).toEqual({
        id: expect.any(String),
        issueId: expect.any(String),
        authorId: ids.reporter,
        body,
        createdAt: expect.any(String),
      });

      const comments = await authed().get(`/api/v1/issues/${issueKey}/comments`).expect(200);
      expect(comments.body).toContainEqual(
        expect.objectContaining({
          id: comment!.id,
          authorId: ids.reporter,
          authorDisplayName: people.reporter.displayName,
        }),
      );

      expect(events).toContainEqual({
        event: 'comment.created',
        payload: expect.objectContaining({
          commentId: comment!.id,
          issueKey,
          userId: ids.reporter,
        }),
      });

      const notifications = await authed().get('/api/v1/notifications').expect(200);
      expect(notifications.body.data).toContainEqual(
        expect.objectContaining({
          type: 'mention',
          data: { issueKey, commentId: comment!.id },
        }),
      );
    });

    it('keeps the request-scoped string form', async () => {
      const comment = await tenantStorage.run(
        { tenantId, schemaName, slug: tenantSlug },
        async () => {
          const context = await contextFactory.create(
            pluginId,
            {},
            {
              id: ownerId,
              email: ownerEmail,
              displayName: 'Owner Olivia',
            },
          );
          return context.api.issues.addComment(issueKey, 'Included in release 2.4.0');
        },
      );

      expect(comment).toEqual(
        expect.objectContaining({
          authorId: ownerId,
          body: {
            type: 'doc',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'Included in release 2.4.0' }] },
            ],
          },
        }),
      );
    });

    it('refuses a comment with no author on a route with no user, writing nothing', async () => {
      const [{ count: before }] = await dataSource.query(
        `SELECT count(*)::int AS count FROM "${schemaName}".comments`,
      );

      await expect(
        asWebhook((context) => context.api.issues.addComment(issueKey, 'Linked Jam')),
      ).rejects.toThrow('requires an interactive user context or an explicit authorId');

      const [{ count: after }] = await dataSource.query(
        `SELECT count(*)::int AS count FROM "${schemaName}".comments`,
      );
      expect(after).toBe(before);
      const [{ count: nullAuthors }] = await dataSource.query(
        `SELECT count(*)::int AS count FROM "${schemaName}".comments WHERE author_id IS NULL`,
      );
      expect(nullAuthors).toBe(0);
    });

    it('refuses an author without write access to the project', async () => {
      await expect(
        asWebhook((context) =>
          context.api.issues.addComment(issueKey, 'Linked Jam', { authorId: ids.projectViewer }),
        ),
      ).rejects.toThrow('Project membership is required');
    });

    it('resolves null for an issue that does not exist', async () => {
      await expect(
        asWebhook((context) =>
          context.api.issues.addComment('INT-9999', 'Linked Jam', { authorId: ids.reporter }),
        ),
      ).resolves.toBeNull();
    });
  });

  describe('users.findMemberByEmail', () => {
    it('maps an email to a tenant member, ignoring case', async () => {
      await expect(
        asWebhook((context) =>
          context.api.users.findMemberByEmail('PLUGIN-PREREQ-Reporter@Example.com'),
        ),
      ).resolves.toEqual({
        id: ids.reporter,
        email: people.reporter.email,
        displayName: people.reporter.displayName,
      });
    });

    it('returns null for a person outside the tenant and for an unknown address', async () => {
      await expect(
        asWebhook((context) => context.api.users.findMemberByEmail(people.outsider.email)),
      ).resolves.toBeNull();
      await expect(
        asWebhook((context) => context.api.users.findMemberByEmail('nobody@example.com')),
      ).resolves.toBeNull();
    });

    it('rejects a value that is not an email address', async () => {
      await expect(
        asWebhook((context) => context.api.users.findMemberByEmail("x' OR 1=1 --")),
      ).rejects.toThrow('Invalid email');
    });
  });

  describe('projects.assertAccess', () => {
    function asUser<T>(
      userId: string,
      email: string,
      callback: (context: PluginContext) => Promise<T>,
    ) {
      return tenantStorage.run({ tenantId, schemaName, slug: tenantSlug }, async () =>
        callback(await contextFactory.create(pluginId, {}, { id: userId, email, displayName: '' })),
      );
    }

    it('allows a project member to write and a project viewer to read', async () => {
      await expect(
        asUser(ids.reporter, people.reporter.email, (context) =>
          context.api.projects.assertAccess('INT', 'write'),
        ),
      ).resolves.toBeUndefined();
      await expect(
        asUser(ids.projectViewer, people.projectViewer.email, (context) =>
          context.api.projects.assertAccess('INT', 'read'),
        ),
      ).resolves.toBeUndefined();
    });

    it('refuses a project viewer write access', async () => {
      await expect(
        asUser(ids.projectViewer, people.projectViewer.email, (context) =>
          context.api.projects.assertAccess('INT', 'write'),
        ),
      ).rejects.toThrow('Project membership is required');
    });

    it('requires a request user', async () => {
      await expect(
        asWebhook((context) => context.api.projects.assertAccess('INT', 'read')),
      ).rejects.toThrow();
    });
  });
});
