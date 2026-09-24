import { ForbiddenException } from '@nestjs/common';
import { tenantStorage } from '../core/tenant';
import { PluginContextFactory } from './plugin-context.factory';

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

  const projectAccess = { assertIssueKey: jest.fn(), accessibleProjectIds: jest.fn().mockResolvedValue([]) };
  let factory: PluginContextFactory;

  beforeEach(() => {
    jest.clearAllMocks();
    entityManager.query.mockResolvedValue([{ role: 'member' }]);
    projectAccess.assertIssueKey.mockResolvedValue(undefined);
    tenantConnections.getEntityManager.mockResolvedValue(entityManager);
    installedPlugins.findOne.mockResolvedValue({ enabled: true });
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
});
