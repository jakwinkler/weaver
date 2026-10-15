import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildPlugin } from '../src/commands/build';
import { createPlugin } from '../src/commands/create-plugin';
import { runtimeServerPath } from '../src/server-build';
import { runVite } from '../src/vite-process';

jest.mock('../src/vite-process', () => ({ runVite: jest.fn().mockResolvedValue(undefined) }));

describe('build', () => {
  const temporaryDirectories: string[] = [];
  const testOutputRoot = join(__dirname, '../node_modules/.cache/weaver-cli-tests');
  let stdout: jest.SpyInstance;

  beforeAll(() => mkdirSync(testOutputRoot, { recursive: true }));

  beforeEach(() => {
    stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.mocked(runVite).mockClear();
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  async function scaffold(includeClient: boolean): Promise<string> {
    const destinationRoot = mkdtempSync(join(testOutputRoot, 'build-'));
    temporaryDirectories.push(destinationRoot);
    return createPlugin({
      name: 'server-tool',
      displayName: 'Server Tool',
      author: 'Test Author',
      type: 'integration',
      scope: 'tenant',
      includeServer: true,
      includeClient,
      destinationRoot,
    });
  }

  it('compiles server-only plugins to the CommonJS files the API loads in production', async () => {
    const pluginRoot = await scaffold(false);

    await buildPlugin(pluginRoot);

    expect(runVite).not.toHaveBeenCalled();
    expect(existsSync(join(pluginRoot, 'dist/client'))).toBe(false);
    expect(stdout).toHaveBeenCalledWith('Server code compiled: dist/server/index.js\n');

    // Load the output with plain Node require(), as the API does.
    const output = execFileSync(
      process.execPath,
      [
        '-e',
        `
        const lifecycle = require(${JSON.stringify(join(pluginRoot, 'dist/server/index.js'))});
        const handlers = require(${JSON.stringify(join(pluginRoot, 'dist/server/handlers.js'))});
        const logged = [];
        const context = { tenant: { id: 'tenant-1' }, logger: { info: (message) => logged.push(message) } };
        Promise.all([lifecycle.onInstall(context), handlers.getHello({}, context)]).then(([, response]) => {
          process.stdout.write(JSON.stringify({ logged, response }));
        });
        `,
      ],
      { encoding: 'utf8' },
    );
    expect(JSON.parse(output)).toEqual({
      logged: ['Server Tool installed'],
      response: { status: 200, body: { message: 'Hello from Server Tool in tenant tenant-1' } },
    });
  });

  it('builds the client bundle and compiles the server code', async () => {
    const pluginRoot = await scaffold(true);

    await buildPlugin(pluginRoot);

    expect(runVite).toHaveBeenCalledWith(
      ['build', '--config', join(pluginRoot, 'vite.config.ts')],
      {
        cwd: pluginRoot,
      },
    );
    expect(existsSync(join(pluginRoot, 'dist/server/index.js'))).toBe(true);
    expect(existsSync(join(pluginRoot, 'dist/server/handlers.js'))).toBe(true);
  });

  it('removes stale server output before compiling', async () => {
    const pluginRoot = await scaffold(false);
    mkdirSync(join(pluginRoot, 'dist/server'), { recursive: true });
    writeFileSync(join(pluginRoot, 'dist/server/removed.handler.js'), 'exports.old = () => {};\n');

    await buildPlugin(pluginRoot);

    expect(existsSync(join(pluginRoot, 'dist/server/removed.handler.js'))).toBe(false);
    expect(existsSync(join(pluginRoot, 'dist/server/index.js'))).toBe(true);
  });

  it('fails when the server code does not type-check', async () => {
    const pluginRoot = await scaffold(false);
    appendFileSync(
      join(pluginRoot, 'src/server/handlers.ts'),
      "\nconst count: number = 'not a number';\n",
    );

    await expect(buildPlugin(pluginRoot)).rejects.toThrow('TypeScript exited with status 2');
  });

  it('stops when a server plugin has no tsconfig.server.json', async () => {
    const pluginRoot = await scaffold(false);
    rmSync(join(pluginRoot, 'tsconfig.server.json'));

    await expect(buildPlugin(pluginRoot)).rejects.toThrow('No tsconfig.server.json found');
  });

  it('stops when a client entrypoint has no vite.config.ts', async () => {
    const pluginRoot = await scaffold(true);
    rmSync(join(pluginRoot, 'vite.config.ts'));

    await expect(buildPlugin(pluginRoot)).rejects.toThrow('No vite.config.ts found');
    expect(runVite).not.toHaveBeenCalled();
  });

  it('maps server entrypoints to the production paths the API loads', () => {
    expect(runtimeServerPath('src/server/index.ts')).toBe('dist/server/index.js');
    expect(runtimeServerPath('./src/server/index.ts')).toBe('dist/server/index.js');
    expect(runtimeServerPath('src\\server\\index.ts')).toBe('dist/server/index.js');
    expect(runtimeServerPath('server/index.ts')).toBe('server/index.js');
  });
});
