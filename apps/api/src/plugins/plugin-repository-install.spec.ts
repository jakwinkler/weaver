import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { tenantStorage } from '../core/tenant';
import { PluginRegistryService } from './plugin-registry.service';

const pluginId = '@weaver/plugin-repository';
const pluginDir = path.resolve(__dirname, '../../../../plugins/plugin-repository');

// Jest compiles plugin sources to CommonJS, where __dirname and require always exist. Outside
// production the API requires the .ts entry through Node's type stripping, which loads it as ESM,
// so onInstall runs in a real Node process and its context calls are replayed into the registry.
// A module-mode script keeps a CommonJS -e scope's require and __dirname out of the plugin.
const recordOnInstall = `
import { createRequire } from 'node:module';
const calls = [];
const record = (callPath) => new Proxy(async (...args) => { calls.push({ path: callPath, args }); }, {
  get: (_target, key) => (key === 'then' || typeof key !== 'string' ? undefined : record([...callPath, key])),
});
const plugin = createRequire(import.meta.url)(process.argv[1]);
plugin.onInstall(record([])).then(() => process.stdout.write(JSON.stringify(calls)));
`;

function runOnInstallInNode(entrypoint: string): Array<{ path: string[]; args: unknown[] }> {
  return JSON.parse(
    execFileSync(process.execPath, ['--input-type=module', '-e', recordOnInstall, entrypoint], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  );
}

describe('Repository plugin install from its source entry', () => {
  it('creates the repository tables once and registers its custom fields', async () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(pluginDir, 'weaver-plugin.json'), 'utf8'));
    const context = {
      logger: { info: jest.fn() },
      db: { runMigration: jest.fn() },
      api: { customFields: { register: jest.fn() } },
    };
    const onInstall = async (installContext: any) => {
      const entrypoint = path.join(pluginDir, manifest.entrypoints.server);
      for (const call of runOnInstallInNode(entrypoint)) {
        const owner = call.path.slice(0, -1).reduce((value, key) => value[key], installContext);
        await owner[call.path[call.path.length - 1]](...call.args);
      }
    };
    const transactionRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    const repo = {
      manager: {
        transaction: jest.fn(async (callback) =>
          callback({ getRepository: () => transactionRepo }),
        ),
      },
    };
    const loader = {
      getManifest: jest.fn().mockReturnValue(manifest),
      getModule: jest.fn().mockResolvedValue({ onInstall }),
      getPluginDir: jest.fn().mockReturnValue(pluginDir),
    };
    const contextFactory = { create: jest.fn().mockResolvedValue(context) };
    const registry = new PluginRegistryService(repo as any, loader as any, contextFactory as any);

    await tenantStorage.run({ tenantId: 'tenant-1', schemaName: 'tenant_test' }, () =>
      registry.install(pluginId),
    );

    expect(context.db.runMigration.mock.calls).toEqual([
      [fs.readFileSync(path.join(pluginDir, 'migrations/001_create_repository_tables.sql'), 'utf8')],
    ]);
    expect(context.api.customFields.register.mock.calls.map(([field]) => field.slug)).toEqual([
      'repo_url',
      'default_branch',
      'pr_url',
      'branch_name',
    ]);
    expect(transactionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ pluginId, version: manifest.version }),
    );
  });
});
