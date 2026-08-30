import { ForbiddenException } from '@nestjs/common';
import { tenantStorage } from '../core/tenant';
import { PluginContextFactory } from './plugin-context.factory';

describe('PluginContextFactory core capability enforcement', () => {
  const entityManager = {
    query: jest.fn(),
  };
  const tenantConnections = {
    getEntityManager: jest.fn().mockResolvedValue(entityManager),
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
    listPluginEntries: jest.fn(),
    getPluginLockState: jest.fn(),
  };

  let factory: PluginContextFactory;

  beforeEach(() => {
    jest.clearAllMocks();
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
