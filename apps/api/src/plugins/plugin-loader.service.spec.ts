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
    fs.writeFileSync(
      path.join(pluginDir, 'weaver-plugin.json'),
      JSON.stringify({
        id: '@example/plugin',
        name: 'Example',
        version: '1.0.0',
        entrypoints: { client: 'src/client/index.ts' },
        permissions: [],
      }),
    );
    fs.writeFileSync(path.join(pluginDir, 'dist/client/remoteEntry.js'), 'export {};');
    service = new PluginLoaderService();
    await service.loadPlugins(pluginsDir);
  });

  afterEach(() => {
    fs.rmSync(pluginsDir, { recursive: true, force: true });
    delete process.env.WEAVER_PLUGIN_DEV_SERVERS;
    delete process.env.API_PREFIX;
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
});
