import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PluginLoaderService } from './plugin-loader.service';

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
