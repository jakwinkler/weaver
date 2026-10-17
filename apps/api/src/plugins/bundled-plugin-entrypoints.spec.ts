import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Jest transpiles every module to CommonJS, so a server entrypoint that plain Node loads as ESM
// (extensionless relative imports, require, __dirname) still passes in-process. These checks
// require each bundled plugin's server entrypoint in a real Node process, as
// PluginLoaderService.getModule does: the source entrypoint outside production, the compiled one
// when built. A CommonJS -e script would leak require and __dirname as globals into modules Node
// loads as ESM, so the script runs as an ES module and requires through createRequire.
const bundledPluginsDir = path.resolve(__dirname, '../../../../plugins');

type LoadResult = { exports: string[] } | { error: string };

const loadInNode = (files: string[]): Record<string, LoadResult> =>
  JSON.parse(
    execFileSync(
      process.execPath,
      [
        '--no-warnings',
        '--input-type=module',
        '-e',
        `import { createRequire } from 'node:module';
        const require = createRequire(import.meta.url);
        const results = {};
        for (const file of process.argv.slice(1)) {
          try {
            const mod = require(file);
            results[file] = { exports: Object.keys(mod) };
          } catch (error) {
            results[file] = { error: String(error) };
          }
        }
        process.stdout.write(JSON.stringify(results));`,
        ...files,
      ],
      { encoding: 'utf8' },
    ),
  );

const cases = fs.readdirSync(bundledPluginsDir).flatMap((directory) => {
  const manifestPath = path.join(bundledPluginsDir, directory, 'weaver-plugin.json');
  if (!fs.existsSync(manifestPath)) return [];
  const server: string | undefined = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).entrypoints
    ?.server;
  if (!server) return [];

  const source = path.join(bundledPluginsDir, directory, server);
  const compiled = path.join(
    bundledPluginsDir,
    directory,
    server.replace(/^(?:\.\/)?src\/server\//, 'dist/server/').replace(/\.ts$/, '.js'),
  );
  return [
    { directory, layout: 'source', file: source },
    ...(fs.existsSync(compiled) ? [{ directory, layout: 'compiled', file: compiled }] : []),
  ];
});

describe('bundled plugin server entrypoints in a plain Node process', () => {
  const results = loadInNode(cases.map((entry) => entry.file));

  it('covers the SCM plugins', () => {
    expect(cases.filter((entry) => entry.layout === 'source').map((entry) => entry.directory)).toEqual(
      expect.arrayContaining(['plugin-github', 'plugin-gitlab', 'plugin-bitbucket']),
    );
  });

  it.each(cases.map((entry) => [`${entry.directory} (${entry.layout})`, entry] as const))(
    '%s loads its server entrypoint',
    (_label, entry) => {
      expect(results[entry.file]).toEqual({ exports: expect.any(Array) });
    },
  );
});
