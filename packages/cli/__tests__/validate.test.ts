import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { pluginManifestSchema } from '@weaver/shared';

import { validatePlugin } from '../src/manifest';

type Manifest = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const validManifest: Manifest = {
  id: '@weaver/plugin-test',
  name: 'Test',
  version: '1.0.0',
  type: 'feature',
  scope: 'tenant',
  entrypoints: { server: 'src/server/index.ts', client: 'src/client/index.ts' },
  permissions: ['test.view'],
  declaredPermissions: [{ key: 'test.view', label: 'View test' }],
  settings: {
    schema: {
      channel: { type: 'select', options: ['alpha', 'beta'], default: 'alpha' },
    },
  },
  ui: {
    navigation: [{ label: 'Test', icon: 'puzzle', path: '/apps/test' }],
    pages: [{ path: '/apps/test', component: 'TestPage' }],
  },
  routes: [{ method: 'GET', path: '/list', handler: 'listHandler' }],
};

function cloneManifest(mutate?: (manifest: Manifest) => void): Manifest {
  const manifest = JSON.parse(JSON.stringify(validManifest)) as Manifest;
  mutate?.(manifest);
  return manifest;
}

describe('validate', () => {
  const temporaryDirectories: string[] = [];
  const testOutputRoot = join(__dirname, '../node_modules/.cache/weaver-cli-tests');

  beforeAll(() => mkdirSync(testOutputRoot, { recursive: true }));

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('reports malformed manifest fields and missing files', () => {
    const pluginRoot = mkdtempSync(join(testOutputRoot, 'invalid-'));
    temporaryDirectories.push(pluginRoot);
    writeFileSync(
      join(pluginRoot, 'weaver-plugin.json'),
      JSON.stringify({
        id: 'Bad ID',
        name: '',
        version: 'one',
        type: 'theme',
        scope: 'global',
        entrypoints: { server: 'src/server/index.ts' },
        permissions: 'plugin.view',
        routes: [{ method: 'FETCH', path: 'hello', handler: '' }],
      }),
    );

    const result = validatePlugin(pluginRoot);
    const codes = result.errors.map((issue) => issue.code);

    expect(codes).toEqual(
      expect.arrayContaining([
        'invalid-id',
        'missing-name',
        'invalid-version',
        'invalid-type',
        'invalid-scope',
        'invalid-permissions',
        'missing-entrypoint',
        'invalid-route-method',
        'invalid-route-path',
        'missing-route-handler',
      ]),
    );
  });

  it('finds route handlers that are missing or not referenced', () => {
    const pluginRoot = mkdtempSync(join(testOutputRoot, 'handlers-'));
    temporaryDirectories.push(pluginRoot);
    mkdirSync(join(pluginRoot, 'src/server'), { recursive: true });
    writeFileSync(
      join(pluginRoot, 'src/server/index.ts'),
      'export async function onInstall() {}\n',
    );
    writeFileSync(
      join(pluginRoot, 'src/server/handlers.ts'),
      'export async function listedHandler() {}\nexport async function unusedHandler() {}\n',
    );
    writeFileSync(
      join(pluginRoot, 'weaver-plugin.json'),
      JSON.stringify({
        id: '@weaver/plugin-test',
        name: 'Test',
        version: '1.0.0',
        type: 'feature',
        scope: 'tenant',
        entrypoints: { server: 'src/server/index.ts' },
        permissions: [],
        routes: [
          { method: 'GET', path: '/listed', handler: 'listedHandler' },
          { method: 'POST', path: '/missing', handler: 'missingHandler' },
        ],
      }),
    );

    const result = validatePlugin(pluginRoot);

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'handler-not-exported', path: 'routes[1].handler' }),
      ]),
    );
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'unreferenced-handler',
          message: expect.stringContaining('unusedHandler'),
        }),
      ]),
    );
  });

  it('reports invalid settings and client component references', () => {
    const pluginRoot = mkdtempSync(join(testOutputRoot, 'client-'));
    temporaryDirectories.push(pluginRoot);
    mkdirSync(join(pluginRoot, 'src/client'), { recursive: true });
    writeFileSync(
      join(pluginRoot, 'src/client/index.ts'),
      'export { ExistingPage } from "./ExistingPage";\n',
    );
    writeFileSync(
      join(pluginRoot, 'src/client/ExistingPage.tsx'),
      'export function ExistingPage() { return null; }\n',
    );
    writeFileSync(
      join(pluginRoot, 'weaver-plugin.json'),
      JSON.stringify({
        id: '@weaver/plugin-test',
        name: 'Test',
        version: '1.0.0',
        entrypoints: { client: 'src/client/index.ts' },
        permissions: [],
        settings: {
          schema: {
            color: { type: 'select', default: 'purple' },
            retries: { type: 'number', default: 'three' },
          },
        },
        ui: { pages: [{ path: '/apps/test', component: 'MissingPage' }] },
      }),
    );

    const result = validatePlugin(pluginRoot);
    const codes = result.errors.map((issue) => issue.code);

    expect(codes).toEqual(
      expect.arrayContaining([
        'missing-select-options',
        'invalid-setting-default',
        'component-not-exported',
      ]),
    );
  });
  function writePlugin(manifest: Manifest): string {
    const pluginRoot = mkdtempSync(join(testOutputRoot, 'schema-'));
    temporaryDirectories.push(pluginRoot);
    mkdirSync(join(pluginRoot, 'src/server'), { recursive: true });
    mkdirSync(join(pluginRoot, 'src/client'), { recursive: true });
    writeFileSync(
      join(pluginRoot, 'src/server/index.ts'),
      'export async function onInstall() {}\n',
    );
    writeFileSync(
      join(pluginRoot, 'src/server/handlers.ts'),
      'export async function listHandler() {}\n',
    );
    writeFileSync(
      join(pluginRoot, 'src/client/index.ts'),
      'export function TestPage() { return null; }\n',
    );
    writeFileSync(join(pluginRoot, 'weaver-plugin.json'), JSON.stringify(manifest));
    return pluginRoot;
  }

  describe('manifest schema shared with the API', () => {
    it('accepts a complete manifest', () => {
      expect(validatePlugin(writePlugin(cloneManifest()))).toEqual({ errors: [], warnings: [] });
    });

    it('accepts setting labels and textarea settings, which the API loads and the settings UI renders', () => {
      const manifest = cloneManifest((m) => {
        m.settings.schema.channel.label = 'Channel';
        m.settings.schema.notes = { type: 'textarea', label: 'Notes' };
      });
      expect(pluginManifestSchema.safeParse(manifest).success).toBe(true);

      expect(validatePlugin(writePlugin(manifest))).toEqual({ errors: [], warnings: [] });
    });

    it.each<[string, (manifest: Manifest) => void, string]>([
      ['at the top level', (m) => (m.homepage = 'https://example.com'), 'homepage'],
      ['in settings', (m) => (m.settings.layout = 'tabs'), 'settings.layout'],
      [
        'in a settings entry',
        (m) => (m.settings.schema.channel.helpText = 'Where to post'),
        'settings.schema.channel.helpText',
      ],
      ['in a route', (m) => (m.routes[0].rateLimit = 5), 'routes[0].rateLimit'],
      ['in ui', (m) => (m.ui.widgets = []), 'ui.widgets'],
      ['in a ui contribution', (m) => (m.ui.navigation[0].badge = 'new'), 'ui.navigation[0].badge'],
    ])('rejects an unknown key %s', (_location, mutate, path) => {
      const manifest = cloneManifest(mutate);
      expect(pluginManifestSchema.safeParse(manifest).success).toBe(false);

      const result = validatePlugin(writePlugin(manifest));

      expect(result.errors).toEqual([
        expect.objectContaining({ severity: 'error', code: 'unknown-property', path }),
      ]);
    });

    it.each<[string, (manifest: Manifest) => void]>([
      ['an id with a dot', (m) => (m.id = '@weaver/plugin-a.b')],
      ['a version with a leading zero', (m) => (m.version = '01.0.0')],
      ['a navigation path without a leading slash', (m) => (m.ui.navigation[0].path = 'apps/x')],
      ['a non-boolean enabledByDefault', (m) => (m.enabledByDefault = 'yes')],
      ['an uninstall block without deletesPrivateData', (m) => (m.uninstall = {})],
      ['an unknown core capability', (m) => (m.requires = { coreCapabilities: ['nope'] })],
      ['an incomplete companion', (m) => (m.companion = { platform: 'macos' })],
      ['an unknown route auth mode', (m) => (m.routes[0].auth = 'basic')],
      [
        'a device route without a companion authenticator',
        (m) => {
          m.routes[0].auth = 'device';
          m.routes[0].requiredDeviceScopes = ['test.scope'];
        },
      ],
      [
        'a versioned migration without a path or sql',
        (m) => (m.migrations = [{ version: '1.0.0' }]),
      ],
    ])('reports every manifest the API schema rejects: %s', (_label, mutate) => {
      const manifest = cloneManifest(mutate);
      expect(pluginManifestSchema.safeParse(manifest).success).toBe(false);

      expect(validatePlugin(writePlugin(manifest)).errors.length).toBeGreaterThan(0);
    });

    it('accepts manifests the API schema accepts', () => {
      const manifest = cloneManifest((m) => {
        m.settings = {};
        m.migrations = [{ version: '1.0.0', sql: 'src/server/index.ts' }];
      });
      expect(pluginManifestSchema.safeParse(manifest).success).toBe(true);

      expect(validatePlugin(writePlugin(manifest))).toEqual({ errors: [], warnings: [] });
    });

    it('checks files named by versioned migrations', () => {
      const manifest = cloneManifest((m) => {
        m.migrations = [{ version: '1.0.0', sql: 'migrations/001.sql' }];
      });

      const result = validatePlugin(writePlugin(manifest));

      expect(result.errors).toEqual([
        expect.objectContaining({ code: 'missing-migration', path: 'migrations[0].sql' }),
      ]);
    });
  });
});
