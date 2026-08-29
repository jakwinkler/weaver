import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { tenantStorage } from '../core/tenant';
import { PluginRegistryService } from './plugin-registry.service';

describe('PluginRegistryService atomic lifecycle handling', () => {
  const transactionRepo = {
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
  };
  const transactionManager = {
    getRepository: jest.fn(() => transactionRepo),
  };
  const repo = {
    findOne: jest.fn(),
    manager: {
      transaction: jest.fn(async (callback) => callback(transactionManager)),
    },
  };
  const loader = {
    getManifest: jest.fn(),
    getModule: jest.fn(),
    getPluginDir: jest.fn(),
  };
  const context = {
    db: { runMigration: jest.fn() },
  };
  const contextFactory = {
    create: jest.fn().mockResolvedValue(context),
  };
  const tenantConnections = {
    getEntityManager: jest.fn(),
  };

  let registry: PluginRegistryService;
  let pluginDirectory: string;

  beforeEach(() => {
    jest.clearAllMocks();
    repo.manager.transaction.mockImplementation(async (callback) => callback(transactionManager));
    transactionRepo.findOne.mockResolvedValue(null);
    transactionRepo.create.mockImplementation((value) => value);
    transactionRepo.save.mockImplementation(async (value) => value);
    contextFactory.create.mockResolvedValue(context);
    loader.getManifest.mockReturnValue({
      id: '@weaver/plugin-automatic-time',
      name: 'Automatic Time',
      version: '0.1.0',
      entrypoints: { server: 'src/server/index.ts' },
      permissions: [],
    });
    pluginDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'weaver-plugin-registry-'));
    loader.getPluginDir.mockReturnValue(pluginDirectory);
    registry = new PluginRegistryService(
      repo as any,
      loader as any,
      contextFactory as any,
      tenantConnections as any,
    );
  });

  afterEach(() => {
    fs.rmSync(pluginDirectory, { recursive: true, force: true });
  });

  function inTenant<T>(callback: () => Promise<T>): Promise<T> {
    return tenantStorage.run({ tenantId: 'tenant-1', schemaName: 'tenant_test' }, callback);
  }

  it('does not mark a plugin installed when onInstall fails', async () => {
    loader.getModule.mockResolvedValue({
      onInstall: jest.fn().mockRejectedValue(new Error('migration failed')),
    });

    await expect(inTenant(() => registry.install('@weaver/plugin-automatic-time'))).rejects.toThrow(
      'migration failed',
    );

    expect(repo.manager.transaction).toHaveBeenCalledTimes(1);
    expect(transactionRepo.save).not.toHaveBeenCalled();
  });

  it('does not advance the installed version when onUpgrade fails', async () => {
    const installed = {
      id: 'installed-1',
      tenantId: 'tenant-1',
      pluginId: '@weaver/plugin-automatic-time',
      version: '0.1.0',
      enabled: true,
      settings: {},
    };
    transactionRepo.findOne.mockResolvedValue(installed);
    loader.getManifest.mockReturnValue({
      id: '@weaver/plugin-automatic-time',
      name: 'Automatic Time',
      version: '0.2.0',
      entrypoints: { server: 'src/server/index.ts' },
      permissions: [],
    });
    loader.getModule.mockResolvedValue({
      onUpgrade: jest.fn().mockRejectedValue(new Error('upgrade failed')),
    });

    await expect(inTenant(() => registry.upgrade('@weaver/plugin-automatic-time'))).rejects.toThrow(
      'upgrade failed',
    );

    expect(installed.version).toBe('0.1.0');
    expect(transactionRepo.save).not.toHaveBeenCalled();
  });

  it('runs versioned migrations in order and advances the version only after success', async () => {
    const installed = {
      id: 'installed-1',
      tenantId: 'tenant-1',
      pluginId: '@weaver/plugin-automatic-time',
      version: '0.1.0',
      enabled: true,
      settings: {},
    };
    transactionRepo.findOne.mockResolvedValue(installed);
    fs.writeFileSync(path.join(pluginDirectory, '002.sql'), 'SELECT 2;');
    fs.writeFileSync(path.join(pluginDirectory, '003.sql'), 'SELECT 3;');
    loader.getManifest.mockReturnValue({
      id: '@weaver/plugin-automatic-time',
      name: 'Automatic Time',
      version: '0.3.0',
      entrypoints: { server: 'src/server/index.ts' },
      permissions: [],
      migrations: [
        { version: '0.3.0', path: '003.sql' },
        { version: '0.2.0', path: '002.sql' },
      ],
    });
    const onUpgrade = jest.fn().mockResolvedValue(undefined);
    loader.getModule.mockResolvedValue({ onUpgrade });

    await expect(inTenant(() => registry.upgrade('@weaver/plugin-automatic-time'))).resolves.toBe(
      installed,
    );

    expect(context.db.runMigration).toHaveBeenNthCalledWith(1, 'SELECT 2;');
    expect(context.db.runMigration).toHaveBeenNthCalledWith(2, 'SELECT 3;');
    expect(onUpgrade).toHaveBeenCalledWith('0.1.0', '0.3.0', context);
    expect(installed.version).toBe('0.3.0');
    expect(transactionRepo.save).toHaveBeenCalledWith(installed);
  });
});
