import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { validatePlugin } from '../src/manifest';

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
});
