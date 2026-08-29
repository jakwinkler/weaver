import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { createPlugin } from '../src/commands/create-plugin';
import { validatePlugin } from '../src/manifest';

describe('create-plugin', () => {
  const temporaryDirectories: string[] = [];
  const testOutputRoot = join(__dirname, '../node_modules/.cache/weaver-cli-tests');

  beforeAll(() => mkdirSync(testOutputRoot, { recursive: true }));

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('scaffolds a valid plugin whose TypeScript compiles', async () => {
    const destinationRoot = mkdtempSync(join(testOutputRoot, 'generated-'));
    temporaryDirectories.push(destinationRoot);

    const pluginRoot = await createPlugin({
      name: 'release-notes',
      displayName: 'Release Notes',
      author: 'Test Author',
      type: 'app',
      scope: 'project',
      includeServer: true,
      includeClient: true,
      destinationRoot,
    });

    const expectedFiles = [
      'README.md',
      'package.json',
      'tsconfig.json',
      'vite.config.ts',
      'weaver-plugin.json',
      'src/server/index.ts',
      'src/server/handlers.ts',
      'src/client/index.ts',
      'src/client/PluginPage.tsx',
    ];

    for (const file of expectedFiles) {
      expect(existsSync(join(pluginRoot, file))).toBe(true);
    }

    const manifest = JSON.parse(readFileSync(join(pluginRoot, 'weaver-plugin.json'), 'utf8'));
    expect(manifest).toMatchObject({
      id: '@weaver/plugin-release-notes',
      name: 'Release Notes',
      author: 'Test Author',
      type: 'app',
      scope: 'project',
      entrypoints: {
        server: 'src/server/index.ts',
        client: 'src/client/index.ts',
      },
    });

    expect(validatePlugin(pluginRoot)).toEqual({ errors: [], warnings: [] });
    execFileSync(
      process.execPath,
      [require.resolve('typescript/bin/tsc'), '--noEmit', '-p', pluginRoot],
      {
        cwd: pluginRoot,
        stdio: 'pipe',
      },
    );
  });

  it('omits optional entrypoints when they are not selected', async () => {
    const destinationRoot = mkdtempSync(join(testOutputRoot, 'generated-'));
    temporaryDirectories.push(destinationRoot);

    const pluginRoot = await createPlugin({
      name: 'server-tool',
      displayName: 'Server Tool',
      author: 'Test Author',
      type: 'integration',
      scope: 'tenant',
      includeServer: true,
      includeClient: false,
      destinationRoot,
    });

    expect(existsSync(join(pluginRoot, 'src/server/index.ts'))).toBe(true);
    expect(existsSync(join(pluginRoot, 'src/client/index.ts'))).toBe(false);
    expect(existsSync(join(pluginRoot, 'vite.config.ts'))).toBe(false);

    const manifest = JSON.parse(readFileSync(join(pluginRoot, 'weaver-plugin.json'), 'utf8'));
    expect(manifest.entrypoints).toEqual({ server: 'src/server/index.ts' });
    expect(manifest.ui).toBeUndefined();
  });

  it('rejects invalid names before creating files', async () => {
    const destinationRoot = mkdtempSync(join(testOutputRoot, 'generated-'));
    temporaryDirectories.push(destinationRoot);

    await expect(
      createPlugin({
        name: 'Not Valid',
        displayName: 'Not Valid',
        author: 'Test Author',
        type: 'app',
        scope: 'tenant',
        includeServer: true,
        includeClient: true,
        destinationRoot,
      }),
    ).rejects.toThrow('lowercase letters, numbers, and single hyphens');
  });
});
