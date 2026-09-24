import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PluginLoaderService } from './plugin-loader.service';

describe('PluginLoaderService client bundles', () => {
  let pluginsDir: string;
  let service: PluginLoaderService;
  let originalNodeEnv: string | undefined;

  beforeEach(async () => {
    originalNodeEnv = process.env.NODE_ENV;
    delete process.env.WEAVER_PLUGIN_DEV_SERVERS;
    delete process.env.API_PREFIX;
    pluginsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weaver-plugins-'));
    const pluginDir = path.join(pluginsDir, 'plugin-example');
    fs.mkdirSync(path.join(pluginDir, 'dist/client'), { recursive: true });
    fs.mkdirSync(path.join(pluginDir, 'dist/server'), { recursive: true });
    fs.writeFileSync(
      path.join(pluginDir, 'weaver-plugin.json'),
      JSON.stringify({
        id: '@example/plugin',
        name: 'Example',
        version: '1.0.0',
        entrypoints: {
          client: 'src/client/index.ts',
          server: 'src/server/index.ts',
        },
        permissions: [],
      }),
    );
    fs.writeFileSync(path.join(pluginDir, 'dist/client/remoteEntry.js'), 'export {};');
    fs.writeFileSync(
      path.join(pluginDir, 'dist/server/webhook.handler.js'),
      'exports.handleWebhook = () => ({ status: 200, body: {} });',
    );
    service = new PluginLoaderService();
    await service.loadPlugins(pluginsDir);
  });

  afterEach(() => {
    fs.rmSync(pluginsDir, { recursive: true, force: true });
    delete process.env.WEAVER_PLUGIN_DEV_SERVERS;
    delete process.env.API_PREFIX;
    delete process.env.WEAVER_TRUSTED_PLUGINS;
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('adds the runtime bundle URL to client manifests', () => {
    expect(service.getAllClientManifests()[0].clientBundle).toBe(
      '/api/v1/plugin-assets/@example/plugin/remoteEntry.js',
    );
  });

  it.each(['traversal', 'symlink'])('refuses server entrypoint %s outside its plugin', async (kind) => {
    const pluginDir = path.join(pluginsDir, 'plugin-example');
    const outside = path.join(pluginsDir, 'outside.js');
    fs.writeFileSync(outside, 'module.exports = { escaped: true };');
    fs.mkdirSync(path.join(pluginDir, 'src/server'), { recursive: true });
    const entry = path.join(pluginDir, 'src/server/index.ts');
    if (kind === 'symlink') fs.symlinkSync(outside, entry);
    const manifest = service.getManifest('@example/plugin')!;
    manifest.entrypoints.server = kind === 'traversal' ? '../outside.js' : 'src/server/index.ts';
    expect(await service.getModule('@example/plugin')).toBeUndefined();
  });

  it('resolves compiled assets without allowing traversal outside dist/client', () => {
    expect(service.resolveClientAsset('@example/plugin/remoteEntry.js')).toBe(
      path.join(pluginsDir, 'plugin-example/dist/client/remoteEntry.js'),
    );
    expect(service.resolveClientAsset('@example/plugin/../weaver-plugin.json')).toBeUndefined();
  });

  it('uses a configured plugin dev server outside production', () => {
    process.env.NODE_ENV = 'development';
    process.env.WEAVER_PLUGIN_DEV_SERVERS = JSON.stringify({
      '@example/plugin': 'http://localhost:5199',
    });

    expect(service.getPluginDevServerUrl('@example/plugin')).toBe('http://localhost:5199');
  });

  it('discovers named handlers from compiled server handler modules in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.WEAVER_TRUSTED_PLUGINS = '@example/plugin';

    const handler = await service.getHandler('@example/plugin', 'handleWebhook');

    expect(handler).toBeInstanceOf(Function);
  });

  it('does not load deployment plugins that are absent from the production trust list', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.WEAVER_TRUSTED_PLUGINS;
    const productionService = new PluginLoaderService();

    await productionService.loadPlugins(pluginsDir);

    expect(productionService.hasPlugin('@example/plugin')).toBe(false);
  });
});
describe('PluginLoaderService manifest validation', () => {
  let pluginsDir: string;
  let loader: PluginLoaderService;

  beforeEach(() => {
    pluginsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weaver-plugin-loader-'));
    loader = new PluginLoaderService();
  });

  afterEach(() => {
    loader.onModuleDestroy();
    fs.rmSync(pluginsDir, { recursive: true, force: true });
  });

  function writeManifest(directory: string, manifest: unknown): void {
    const pluginDir = path.join(pluginsDir, directory);
    fs.mkdirSync(pluginDir);
    fs.writeFileSync(path.join(pluginDir, 'weaver-plugin.json'), JSON.stringify(manifest));
  }

  it('loads a validated manifest with core requirements and companion metadata', async () => {
    writeManifest('automatic-time', {
      id: '@weaver/plugin-automatic-time',
      name: 'Automatic Time',
      version: '0.1.0',
      type: 'app',
      scope: 'tenant',
      entrypoints: { server: 'src/server/index.ts' },
      permissions: ['automatic-time.view'],
      requires: {
        coreCapabilities: ['issue-candidates', 'time-entries'],
      },
      companion: {
        platform: 'macos',
        downloadArtifact: 'automatic-time-macos',
        minimumVersion: '0.1.0',
        pairingRoute: '/automatic-time/pair',
      },
      migrations: [{ version: '0.1.0', path: 'migrations/001-create-tables.sql' }],
    });

    await loader.loadPlugins(pluginsDir);

    expect(loader.getManifest('@weaver/plugin-automatic-time')).toEqual(
      expect.objectContaining({
        requires: {
          coreCapabilities: ['issue-candidates', 'time-entries'],
        },
        companion: expect.objectContaining({ platform: 'macos' }),
      }),
    );
  });

  it('rejects a malformed manifest instead of trusting parsed JSON', async () => {
    writeManifest('invalid', {
      id: '@weaver/plugin-invalid',
      name: 'Invalid',
      version: 'not-semver',
      entrypoints: {},
      permissions: 'issues.read',
    });

    await loader.loadPlugins(pluginsDir);

    expect(loader.hasPlugin('@weaver/plugin-invalid')).toBe(false);
  });

  it('rejects device routes without scoped companion authentication', async () => {
    writeManifest('unsafe-device-route', {
      id: '@weaver/plugin-unsafe-device',
      name: 'Unsafe Device Plugin',
      version: '1.0.0',
      entrypoints: { server: 'src/server/index.ts' },
      permissions: [],
      routes: [
        {
          method: 'POST',
          path: '/device/write',
          handler: 'writeFromDevice',
          auth: 'device',
        },
      ],
    });

    await loader.loadPlugins(pluginsDir);

    expect(loader.getManifest('@weaver/plugin-unsafe-device')).toBeUndefined();
  });

  it('accepts every existing bundled plugin manifest', async () => {
    const bundledPluginsDir = path.resolve(__dirname, '../../../../plugins');

    await loader.loadPlugins(bundledPluginsDir);

    const manifestFiles = fs
      .readdirSync(bundledPluginsDir, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() &&
          fs.existsSync(path.join(bundledPluginsDir, entry.name, 'weaver-plugin.json')),
      );
    expect(loader.getAllManifests()).toHaveLength(manifestFiles.length);
  });
});
