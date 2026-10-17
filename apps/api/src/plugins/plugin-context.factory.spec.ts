import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { tenantStorage } from '../core/tenant';
import { fetchWithSafeRedirects } from '../core/security/outbound-http';
import { PluginContextFactory } from './plugin-context.factory';

jest.mock('../core/security/outbound-http', () => ({
  ...jest.requireActual('../core/security/outbound-http'),
  fetchWithSafeRedirects: jest.fn(),
}));

describe('PluginContextFactory core capability enforcement', () => {
  const entityManager = {
    query: jest.fn(),
    transaction: jest.fn(async (callback: (manager: unknown) => Promise<unknown>): Promise<unknown> =>
      callback(entityManager),
    ),
  };
  const tenantConnections = {
    getEntityManager: jest.fn().mockResolvedValue(entityManager),
    runInTenantTransaction: jest.fn(async (callback: (manager: unknown) => Promise<unknown>) => callback(entityManager)),
  };
  const eventDispatcher = {
    emit: jest.fn().mockResolvedValue(undefined),
  };
  const loader = {
    getManifest: jest.fn(),
  };
  const installedPlugins = {
    findOne: jest.fn(),
  };
  const timeTracking = {
    createBatch: jest.fn(),
    updatePluginEntry: jest.fn(),
    deletePluginEntry: jest.fn(),
    deletePluginEntriesBatch: jest.fn(),
    listPluginEntries: jest.fn(),
    countOwnEntriesBySource: jest.fn(),
    getPluginLockState: jest.fn(),
  };

  const projectAccess = {
    assertIssueKey: jest.fn(),
    assertProjectKey: jest.fn(),
    accessibleProjectIds: jest.fn().mockResolvedValue([]),
  };
  const tenants = { findById: jest.fn() };
  const issuesService = { create: jest.fn() };
  const commentsService = { create: jest.fn() };
  const permissions = { assertPermissions: jest.fn() };
  const memberVisibility = { assertVisibleMember: jest.fn() };
  let factory: PluginContextFactory;

  beforeEach(() => {
    jest.clearAllMocks();
    entityManager.query.mockResolvedValue([{ role: 'member' }]);
    projectAccess.assertIssueKey.mockResolvedValue(undefined);
    projectAccess.assertProjectKey.mockResolvedValue(undefined);
    permissions.assertPermissions.mockResolvedValue(undefined);
    memberVisibility.assertVisibleMember.mockResolvedValue(undefined);
    tenantConnections.getEntityManager.mockResolvedValue(entityManager);
    installedPlugins.findOne.mockResolvedValue({ enabled: true });
    tenants.findById.mockResolvedValue({ id: 'tenant-1', slug: 'acme', schemaName: 'tenant_test' });
    loader.getManifest.mockReturnValue({
      id: '@weaver/plugin-automatic-time',
      requires: { coreCapabilities: ['issue-candidates', 'time-entries'] },
    });
    factory = new PluginContextFactory(
      tenantConnections as any,
      eventDispatcher as any,
      loader as any,
      installedPlugins as any,
      timeTracking as any,
      projectAccess as any,
      { processOnce: jest.fn() } as any,
      tenants as any,
      issuesService as any,
      commentsService as any,
      permissions as any,
      memberVisibility as any,
    );
  });

  async function withContext<T>(
    callback: (context: Awaited<ReturnType<PluginContextFactory['create']>>) => Promise<T>,
  ) {
    return tenantStorage.run({ tenantId: 'tenant-1', schemaName: 'tenant_test' }, async () => {
      const context = await factory.create(
        '@weaver/plugin-automatic-time',
        {},
        { id: 'user-1', email: 'matt@example.com', displayName: 'Matt' },
      );
      return callback(context);
    });
  }

  it('allows an enabled plugin with the declared time-entry capability', async () => {
    const expected = { entries: [{ id: 'entry-1' }], created: 1 };
    timeTracking.createBatch.mockResolvedValue(expected);
    const request = {
      entries: [{ issueKey: 'WEB-1', sourceReference: 'draft-1', minutes: 30 }],
    };

    await expect(
      withContext((context) => context.api.timeEntries.createBatch(request)),
    ).resolves.toBe(expected);
    expect(timeTracking.createBatch).toHaveBeenCalledWith(
      '@weaver/plugin-automatic-time',
      request,
      'user-1',
    );
  });

  it('rejects untrusted issue update keys before constructing SQL', async () => {
    await expect(withContext((context) => context.api.issues.update('SAFE-1', {
      'summary" = NULL WHERE true; --': 'injected',
    }))).rejects.toThrow('Unsupported issue update field');
    expect(entityManager.query).not.toHaveBeenCalled();
  });

  it('denies time creation on an inaccessible issue before calling the writer', async () => {
    projectAccess.assertIssueKey.mockRejectedValue(new ForbiddenException('Project membership is required'));
    await expect(withContext((context) => context.api.timeEntries.createBatch({
      entries: [{ issueKey: 'PRIVATE-1', sourceReference: 'draft-1', minutes: 10 }],
    }))).rejects.toThrow('Project membership');
    expect(timeTracking.createBatch).not.toHaveBeenCalled();
  });

  it('forwards atomic plugin batch deletion through the declared capability', async () => {
    timeTracking.deletePluginEntriesBatch.mockResolvedValue({ deleted: 2 });

    await expect(
      withContext((context) => context.api.timeEntries.deleteBatch(['entry-1', 'entry-2'])),
    ).resolves.toEqual({ deleted: 2 });
    expect(timeTracking.deletePluginEntriesBatch).toHaveBeenCalledWith(
      '@weaver/plugin-automatic-time',
      ['entry-1', 'entry-2'],
      'user-1',
    );
  });

  it('forwards private source counts through the declared capability', async () => {
    timeTracking.countOwnEntriesBySource.mockResolvedValue({ manual: 2, timer: 1, plugin: 4 });
    const filters = { loggedFrom: '2026-08-01T00:00:00Z' };

    await expect(
      withContext((context) => context.api.timeEntries.countOwnBySource(filters)),
    ).resolves.toEqual({ manual: 2, timer: 1, plugin: 4 });
    expect(timeTracking.countOwnEntriesBySource).toHaveBeenCalledWith(
      filters,
      'user-1',
      entityManager,
    );
  });

  it('denies a plugin that did not declare the required capability', async () => {
    loader.getManifest.mockReturnValue({
      id: '@weaver/plugin-automatic-time',
      requires: { coreCapabilities: [] },
    });
    await expect(
      withContext((context) =>
        context.api.timeEntries.createBatch({
          entries: [{ issueKey: 'WEB-1', sourceReference: 'draft-1', minutes: 30 }],
        }),
      ),
    ).rejects.toThrow(
      new ForbiddenException(
        'Plugin @weaver/plugin-automatic-time has not declared the time-entries capability',
      ),
    );
    expect(timeTracking.createBatch).not.toHaveBeenCalled();
  });

  it('denies a declared capability when the plugin is disabled', async () => {
    installedPlugins.findOne.mockResolvedValue({ enabled: false });
    await expect(
      withContext((context) =>
        context.api.timeEntries.createBatch({
          entries: [{ issueKey: 'WEB-1', sourceReference: 'draft-1', minutes: 30 }],
        }),
      ),
    ).rejects.toThrow(
      new ForbiddenException('Plugin @weaver/plugin-automatic-time is not installed and enabled'),
    );
    expect(timeTracking.createBatch).not.toHaveBeenCalled();
  });

  describe('tenant identity', () => {
    it('exposes the slug carried by the tenant context without a lookup', async () => {
      const context = await tenantStorage.run(
        { tenantId: 'tenant-1', schemaName: 'tenant_test', slug: 'from-context' },
        () => factory.create('@weaver/plugin-automatic-time', {}),
      );

      expect(context.tenant).toEqual({
        id: 'tenant-1',
        slug: 'from-context',
        schemaName: 'tenant_test',
      });
      expect(tenants.findById).not.toHaveBeenCalled();
    });

    it('looks the slug up by tenant id when the context carries only the id', async () => {
      const context = await tenantStorage.run(
        { tenantId: 'tenant-1', schemaName: 'tenant_test' },
        () => factory.create('@weaver/plugin-automatic-time', {}),
      );

      expect(context.tenant).toEqual({
        id: 'tenant-1',
        slug: 'acme',
        schemaName: 'tenant_test',
      });
      expect(tenants.findById).toHaveBeenCalledTimes(1);
      expect(tenants.findById).toHaveBeenCalledWith('tenant-1');
    });

    it('fails instead of handing a plugin an empty slug when the tenant record is missing', async () => {
      tenants.findById.mockResolvedValue(null);

      await expect(
        tenantStorage.run(
          { tenantId: 'tenant-1', schemaName: 'tenant_test' },
          () => factory.create('@weaver/plugin-automatic-time', {}),
        ),
      ).rejects.toThrow('Tenant not found: tenant-1');
    });
  });

  const pluginId = '@weaver/plugin-intake-test';
  const reporterId = '7d2a3c4e-5f60-4718-9a2b-3c4d5e6f7081';
  const document = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'mention', attrs: { id: reporterId, label: 'Riley' } },
          { type: 'text', text: ' can you reproduce this?' },
        ],
      },
    ],
  };

  function routeQueries() {
    entityManager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('tenant_memberships')) return [{ role: 'member', email: 'riley@example.com' }];
      if (sql.includes('FROM issues')) return [{ id: 'issue-1' }];
      return [];
    });
  }

  async function withPluginContext<T>(
    user: { id: string; email: string; displayName: string } | undefined,
    callback: (context: Awaited<ReturnType<PluginContextFactory['create']>>) => Promise<T>,
  ) {
    return tenantStorage.run({ tenantId: 'tenant-1', schemaName: 'tenant_test', slug: 'acme' }, async () =>
      callback(await factory.create(pluginId, {}, user)),
    );
  }

  describe('issues.create', () => {
    beforeEach(() => {
      routeQueries();
      loader.getManifest.mockReturnValue({ id: pluginId, requires: { coreCapabilities: ['issue-create'] } });
      issuesService.create.mockResolvedValue({
        id: 'issue-1',
        key: 'WEB-7',
        summary: 'Checkout button does nothing',
        statusId: 'status-open',
        reporterId,
        assigneeId: null,
        createdAt: new Date('2026-10-16T12:00:00Z'),
      });
    });

    it('creates through IssuesService for an explicit reporter when there is no request user', async () => {
      const created = await withPluginContext(undefined, (context) =>
        context.api.issues.create('WEB', { summary: 'Checkout button does nothing' }, { reporterId }),
      );

      expect(created).toEqual({
        id: 'issue-1',
        key: 'WEB-7',
        projectKey: 'WEB',
        summary: 'Checkout button does nothing',
        statusId: 'status-open',
        reporterId,
        assigneeId: null,
        createdAt: '2026-10-16T12:00:00.000Z',
      });
      const reporter = { userId: reporterId, tenantId: 'tenant-1', email: 'riley@example.com', role: 'member' };
      expect(permissions.assertPermissions).toHaveBeenCalledWith(reporter, [{ category: 'issues', action: 'create' }]);
      expect(projectAccess.assertProjectKey).toHaveBeenCalledWith('WEB', reporter, 'write');
      expect(issuesService.create).toHaveBeenCalledWith(
        'WEB',
        expect.objectContaining({ summary: 'Checkout button does nothing', priority: 'medium', labels: [], customFields: {} }),
        reporterId,
      );
      // IssuesService.create writes the created activity entry; a second one here would duplicate it.
      expect(entityManager.query).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO activity_logs'),
        expect.anything(),
      );
      expect(tenantConnections.runInTenantTransaction).toHaveBeenCalled();
    });

    it('defaults the reporter to the request user and checks assign rights for an assignee', async () => {
      const assigneeId = '0b1c2d3e-4f50-4617-8a9b-0c1d2e3f4a5b';
      await withPluginContext({ id: reporterId, email: 'riley@example.com', displayName: 'Riley' }, (context) =>
        context.api.issues.create('WEB', { summary: 'Assigned', assigneeId }),
      );

      const reporter = expect.objectContaining({ userId: reporterId });
      expect(permissions.assertPermissions).toHaveBeenCalledWith(reporter, [
        { category: 'issues', action: 'create' },
        { category: 'issues', action: 'assign' },
      ]);
      expect(memberVisibility.assertVisibleMember).toHaveBeenCalledWith(reporter, assigneeId);
      expect(issuesService.create).toHaveBeenCalledWith('WEB', expect.objectContaining({ assigneeId }), reporterId);
    });

    it('denies a plugin that did not declare issue-create', async () => {
      loader.getManifest.mockReturnValue({ id: pluginId, requires: { coreCapabilities: ['issue-candidates'] } });

      await expect(withPluginContext(undefined, (context) =>
        context.api.issues.create('WEB', { summary: 'Nope' }, { reporterId }),
      )).rejects.toThrow(new ForbiddenException(`Plugin ${pluginId} has not declared the issue-create capability`));
      expect(issuesService.create).not.toHaveBeenCalled();
    });

    it('requires a reporter when there is no request user', async () => {
      await expect(withPluginContext(undefined, (context) =>
        context.api.issues.create('WEB', { summary: 'Who reported this?' }),
      )).rejects.toThrow(`Plugin ${pluginId} requires an interactive user context or an explicit reporterId`);
      expect(issuesService.create).not.toHaveBeenCalled();
    });

    it('rejects a reporter outside the tenant before creating anything', async () => {
      entityManager.query.mockResolvedValue([]);

      await expect(withPluginContext(undefined, (context) =>
        context.api.issues.create('WEB', { summary: 'Outsider' }, { reporterId }),
      )).rejects.toThrow(new ForbiddenException('Tenant membership is required'));
      expect(issuesService.create).not.toHaveBeenCalled();
    });

    it('rejects a reporter without write access to the project', async () => {
      projectAccess.assertProjectKey.mockRejectedValue(new ForbiddenException('Project membership is required'));

      await expect(withPluginContext(undefined, (context) =>
        context.api.issues.create('WEB', { summary: 'Viewer' }, { reporterId }),
      )).rejects.toThrow('Project membership is required');
      expect(issuesService.create).not.toHaveBeenCalled();
    });

    it('rejects a reporter whose role cannot create issues', async () => {
      permissions.assertPermissions.mockRejectedValue(new ForbiddenException('Missing permission: issues.create'));

      await expect(withPluginContext(undefined, (context) =>
        context.api.issues.create('WEB', { summary: 'No create permission' }, { reporterId }),
      )).rejects.toThrow('Missing permission: issues.create');
      expect(issuesService.create).not.toHaveBeenCalled();
    });

    it.each([
      ['a missing summary', {}],
      ['an unknown field', { summary: 'Typo', reporterId }],
      ['a recurrence rule', { summary: 'Repeat', recurrenceRule: { frequency: 'daily', interval: 1 } }],
      ['an invalid description', { summary: 'Bad doc', description: { type: 'paragraph' } }],
    ])('rejects %s before touching the database', async (_label, input) => {
      await expect(withPluginContext(undefined, (context) =>
        context.api.issues.create('WEB', input as never, { reporterId }),
      )).rejects.toThrow(BadRequestException);
      expect(entityManager.query).not.toHaveBeenCalled();
      expect(issuesService.create).not.toHaveBeenCalled();
    });

    it('rejects a reporter id that is not a UUID', async () => {
      await expect(withPluginContext(undefined, (context) =>
        context.api.issues.create('WEB', { summary: 'Bad reporter' }, { reporterId: 'jam-user-7' }),
      )).rejects.toThrow('Invalid reporterId');
      expect(issuesService.create).not.toHaveBeenCalled();
    });
  });

  describe('issues.addComment', () => {
    beforeEach(() => {
      routeQueries();
      commentsService.create.mockImplementation(async (_key, dto, authorId) => ({
        id: 'comment-1',
        issueId: 'issue-1',
        authorId,
        body: dto.body,
        createdAt: new Date('2026-10-16T12:05:00Z'),
      }));
    });

    it('comments through CommentsService as an explicit author when there is no request user', async () => {
      const comment = await withPluginContext(undefined, (context) =>
        context.api.issues.addComment('WEB-7', document, { authorId: reporterId }),
      );

      expect(comment).toEqual({
        id: 'comment-1',
        issueId: 'issue-1',
        authorId: reporterId,
        body: document,
        createdAt: '2026-10-16T12:05:00.000Z',
      });
      const author = { userId: reporterId, tenantId: 'tenant-1', email: 'riley@example.com', role: 'member' };
      expect(permissions.assertPermissions).toHaveBeenCalledWith(author, [{ category: 'comments', action: 'create' }]);
      expect(projectAccess.assertIssueKey).toHaveBeenCalledWith('WEB-7', author, 'write');
      expect(commentsService.create).toHaveBeenCalledWith('WEB-7', { body: document }, reporterId, 'tenant-1');
    });

    it('keeps the request-scoped string form, wrapping the text in one paragraph', async () => {
      await withPluginContext({ id: reporterId, email: 'riley@example.com', displayName: 'Riley' }, (context) =>
        context.api.issues.addComment('WEB-7', 'Included in release 2.4.0'),
      );

      expect(commentsService.create).toHaveBeenCalledWith(
        'WEB-7',
        {
          body: {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Included in release 2.4.0' }] }],
          },
        },
        reporterId,
        'tenant-1',
      );
    });

    it('refuses a background comment with no author instead of writing a null author', async () => {
      await expect(withPluginContext(undefined, (context) =>
        context.api.issues.addComment('WEB-7', 'Linked Jam'),
      )).rejects.toThrow(`Plugin ${pluginId} requires an interactive user context or an explicit authorId`);
      expect(commentsService.create).not.toHaveBeenCalled();
    });

    it('rejects an author without write access to the issue project', async () => {
      projectAccess.assertIssueKey.mockRejectedValue(new ForbiddenException('Project membership is required'));

      await expect(withPluginContext(undefined, (context) =>
        context.api.issues.addComment('WEB-7', 'Linked Jam', { authorId: reporterId }),
      )).rejects.toThrow('Project membership is required');
      expect(commentsService.create).not.toHaveBeenCalled();
    });

    it('still resolves null for a missing issue', async () => {
      entityManager.query.mockImplementation(async (sql: string) => (sql.includes('FROM issues') ? [] : [{ role: 'member' }]));

      await expect(withPluginContext(undefined, (context) =>
        context.api.issues.addComment('WEB-404', 'Linked Jam', { authorId: reporterId }),
      )).resolves.toBeNull();
      expect(commentsService.create).not.toHaveBeenCalled();
    });

    it.each([
      ['an empty string', '   '],
      ['an invalid document', { type: 'doc', content: [{ type: 'text', text: 'bare text at the top level' }] }],
    ])('rejects %s before touching the database', async (_label, body) => {
      await expect(withPluginContext(undefined, (context) =>
        context.api.issues.addComment('WEB-7', body, { authorId: reporterId }),
      )).rejects.toThrow(BadRequestException);
      expect(entityManager.query).not.toHaveBeenCalled();
      expect(commentsService.create).not.toHaveBeenCalled();
    });
  });

  describe('http responseType', () => {
    const fetchMock = fetchWithSafeRedirects as jest.MockedFunction<typeof fetchWithSafeRedirects>;
    const eventStream = 'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"content":[]}}\n\n';

    function respond(body: string, contentType: string) {
      fetchMock.mockResolvedValue(new Response(body, { status: 200, headers: { 'content-type': contentType } }));
    }

    it('returns the raw body for text responses', async () => {
      respond(eventStream, 'text/event-stream');

      const response = await withPluginContext(undefined, (context) =>
        context.http.post('https://mcp.example.test/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' }, {
          headers: { Accept: 'application/json, text/event-stream' },
          responseType: 'text',
        }),
      );

      expect(response).toEqual({
        status: 200,
        data: eventStream,
        headers: expect.objectContaining({ 'content-type': 'text/event-stream' }),
      });
      expect(fetchMock).toHaveBeenCalledWith('https://mcp.example.test/mcp', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
        headers: expect.objectContaining({ Accept: 'application/json, text/event-stream' }),
        signal: expect.any(AbortSignal),
      }));
    });

    it('keeps JSON parsing as the default, with null for a non-JSON body', async () => {
      respond('{"ok":true}', 'application/json');
      const json = await withPluginContext(undefined, (context) => context.http.get('https://api.example.test/ok'));
      expect(json.data).toEqual({ ok: true });

      respond(eventStream, 'text/event-stream');
      const stream = await withPluginContext(undefined, (context) => context.http.get('https://api.example.test/sse'));
      expect(stream.data).toBeNull();
    });

    it('returns an empty string for an empty text body', async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 202 }));
      const response = await withPluginContext(undefined, (context) =>
        context.http.post('https://mcp.example.test/mcp', {}, { responseType: 'text' }),
      );
      expect(response).toEqual(expect.objectContaining({ status: 202, data: '' }));
    });

    it('applies the 1 MB cap to text responses', async () => {
      respond('x'.repeat(1024 * 1024 + 1), 'text/plain');
      await expect(withPluginContext(undefined, (context) =>
        context.http.get('https://api.example.test/huge', { responseType: 'text' }),
      )).rejects.toThrow('Outbound response exceeded size limit');
    });

    it('rejects an unknown responseType before sending the request', async () => {
      await expect(withPluginContext(undefined, (context) =>
        context.http.get('https://api.example.test/ok', { responseType: 'txt' as never }),
      )).rejects.toThrow('Unsupported responseType: txt');
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
