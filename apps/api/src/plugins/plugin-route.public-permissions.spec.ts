import type { Request, Response } from 'express';
import type { PluginRouteDefinition } from '@weaver/sdk';
import { PluginRouteController } from './plugin-route.controller';
import { matchPluginRoute } from './plugin-route.matcher';

jest.mock('./plugin-route.matcher', () => ({ matchPluginRoute: jest.fn() }));

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

describe('public plugin routes that declare required permissions', () => {
  function setup(route: Partial<PluginRouteDefinition>, roles: Record<string, Record<string, boolean>> = {}) {
    (matchPluginRoute as jest.Mock).mockReturnValue({
      pluginId: 'acme',
      normalizedPath: `/public/${TENANT_ID}/status`,
      route: { method: 'GET', path: '/public/:tenantId/status', handler: 'status', public: true, ...route },
      params: { tenantId: TENANT_ID },
    });
    const handler = jest.fn().mockResolvedValue({ status: 200, body: { ok: true } });
    const loader = { getHandler: jest.fn().mockResolvedValue(handler) };
    const registry = {
      findInstalled: jest.fn().mockResolvedValue({ enabled: true, settings: {} }),
      mergeSettingsWithDefaults: jest.fn().mockReturnValue({}),
    };
    const contextFactory = { create: jest.fn().mockResolvedValue({}) };
    const findOne = jest.fn(async ({ where: { name } }: { where: { name: string } }) =>
      roles[name] ? { name, permissions: roles[name] } : null,
    );
    const tenantConnections = {
      getEntityManager: jest.fn().mockResolvedValue({ getRepository: () => ({ findOne }) }),
    };
    const tenantService = {
      findById: jest.fn().mockResolvedValue({ id: TENANT_ID, schemaName: 'tenant_acme', slug: 'acme' }),
    };
    const controller = new PluginRouteController(
      registry as never,
      loader as never,
      contextFactory as never,
      tenantConnections as never,
      tenantService as never,
      {} as never,
    );
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
    };
    const call = (user?: Record<string, string>) =>
      controller.handlePluginRoute(
        { method: 'GET', headers: {}, query: {}, user } as unknown as Request,
        res as unknown as Response,
      );
    return { call, res, handler };
  }

  it('requires a signed-in caller', async () => {
    const { call, res, handler } = setup({ requiredPermissions: ['issues.read'] });

    await call();

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Authentication required' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('fails closed when the caller role no longer exists', async () => {
    const { call, res, handler } = setup({ requiredPermissions: ['issues.read'] });

    await call({ userId: 'u1', email: 'u1@example.com', role: 'retired-role' });

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: 'Missing required permissions', missing: ['issues.read'] });
    expect(handler).not.toHaveBeenCalled();
  });

  it('runs the handler once the role grants the permission', async () => {
    const { call, res, handler } = setup({ requiredPermissions: ['issues.read'] }, { member: { 'issues.read': true } });

    await call({ userId: 'u1', email: 'u1@example.com', role: 'member' });

    expect(handler).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('keeps public routes without required permissions open to anonymous callers', async () => {
    const { call, res, handler } = setup({});

    await call();

    expect(handler).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
