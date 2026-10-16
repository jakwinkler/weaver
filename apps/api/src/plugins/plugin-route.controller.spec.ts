import { IssueEntity, ProjectEntity, ProjectPluginEntity } from '@weaver/db';
import { PluginRouteController } from './plugin-route.controller';

describe('PluginRouteController project plugin enablement', () => {
  const pluginId = '@acme/plugin-scoped';
  const routes = [
    { method: 'GET', path: '/projects/:projectKey/summary', handler: 'projectSummary' },
    { method: 'GET', path: '/issues/:issueKey/summary', handler: 'issueSummary' },
    { method: 'GET', path: '/overview', handler: 'overview' },
  ];

  function setup({ scope, enabledProjectIds }: { scope: 'project' | 'tenant'; enabledProjectIds: string[] }) {
    const handler = jest.fn().mockResolvedValue({ status: 200, body: { ok: true } });
    const projectPlugins = {
      findOneBy: jest.fn(async ({ projectId, pluginId: id, enabled }: Record<string, unknown>) =>
        id === pluginId && enabled === true && enabledProjectIds.includes(projectId as string)
          ? { projectId, pluginId, enabled: true }
          : null),
    };
    const repositories = new Map<unknown, unknown>([
      [ProjectEntity, { findOneBy: jest.fn(async ({ key }: { key: string }) => (key === 'OPEN' ? { id: 'project-open' } : null)) }],
      [IssueEntity, { findOneBy: jest.fn(async ({ key }: { key: string }) => (key === 'OPEN-1' ? { projectId: 'project-open' } : null)) }],
      [ProjectPluginEntity, projectPlugins],
    ]);
    const controller = new PluginRouteController(
      {
        findInstalled: jest.fn().mockResolvedValue({ enabled: true, settings: {} }),
        mergeSettingsWithDefaults: jest.fn().mockReturnValue({}),
      } as never,
      {
        getManifest: jest.fn((id: string) => (id === pluginId ? { id: pluginId, scope, routes } : undefined)),
        getHandler: jest.fn().mockResolvedValue(handler),
      } as never,
      { create: jest.fn().mockResolvedValue({}) } as never,
      { getEntityManager: jest.fn().mockResolvedValue({ getRepository: (entity: unknown) => repositories.get(entity) }) } as never,
      {} as never,
      {
        assertProjectKey: jest.fn().mockResolvedValue(undefined),
        assertIssueKey: jest.fn().mockResolvedValue(undefined),
      } as never,
    );
    return { controller, handler, projectPlugins };
  }

  async function call(controller: PluginRouteController, path: string) {
    const res = { status: jest.fn(), json: jest.fn(), send: jest.fn(), setHeader: jest.fn() };
    res.status.mockReturnValue(res);
    await controller.handlePluginRoute(
      {
        path: `/api/v1/plugin-routes/@acme~plugin-scoped${path}`,
        method: 'GET',
        query: {},
        headers: {},
        user: { userId: 'user-1', email: 'member@example.com', role: 'member' },
      } as never,
      res as never,
    );
    return { status: res.status.mock.calls[0]?.[0], body: res.json.mock.calls[0]?.[0] };
  }

  it('answers like a disabled plugin when the project has not enabled a project-scoped plugin', async () => {
    const { controller, handler } = setup({ scope: 'project', enabledProjectIds: [] });

    await expect(call(controller, '/projects/OPEN/summary')).resolves.toEqual({
      status: 503,
      body: { message: 'Plugin is disabled' },
    });
    await expect(call(controller, '/issues/OPEN-1/summary')).resolves.toEqual({
      status: 503,
      body: { message: 'Plugin is disabled' },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('runs a project-scoped handler once the project has enabled the plugin', async () => {
    const { controller, handler } = setup({ scope: 'project', enabledProjectIds: ['project-open'] });

    await expect(call(controller, '/projects/OPEN/summary')).resolves.toEqual({ status: 200, body: { ok: true } });
    await expect(call(controller, '/issues/OPEN-1/summary')).resolves.toEqual({ status: 200, body: { ok: true } });
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('keeps the tenant-level behavior when no project resolves from the route', async () => {
    const { controller, handler, projectPlugins } = setup({ scope: 'project', enabledProjectIds: [] });

    await expect(call(controller, '/overview')).resolves.toEqual({ status: 200, body: { ok: true } });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(projectPlugins.findOneBy).not.toHaveBeenCalled();
  });

  it('does not consult project_plugins for tenant-scoped plugins', async () => {
    const { controller, handler, projectPlugins } = setup({ scope: 'tenant', enabledProjectIds: [] });

    await expect(call(controller, '/projects/OPEN/summary')).resolves.toEqual({ status: 200, body: { ok: true } });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(projectPlugins.findOneBy).not.toHaveBeenCalled();
  });
});
