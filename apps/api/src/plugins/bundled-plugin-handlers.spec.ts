import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Jest transpiles TypeScript and resolves packages itself, so a handler importing something plain
// Node cannot load (a source-only package entry, an extensionless re-export) still passes
// in-process. These checks require each bundled plugin's handler modules in a real Node process,
// as PluginLoaderService does: source handlers outside production, compiled ones when built.
const bundledPluginsDir = path.resolve(__dirname, '../../../../plugins');
const layouts = [
  { name: 'source', dir: 'src/server', pattern: /^(?:handlers|.+\.handler)\.ts$/ },
  { name: 'compiled', dir: 'dist/server', pattern: /^(?:handlers|.+\.handler)\.js$/ },
];

type LoadResult = { exports: string[] } | { error: string };

const loadInNode = (files: string[]): Record<string, LoadResult> =>
  JSON.parse(
    execFileSync(
      process.execPath,
      [
        '--no-warnings',
        '-e',
        `const results = {};
        for (const file of process.argv.slice(1)) {
          try {
            const mod = require(file);
            results[file] = { exports: Object.keys(mod).filter((key) => typeof mod[key] === 'function') };
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
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const handlers: string[] = (manifest.routes ?? []).map((route: { handler: string }) => route.handler);
  if (!handlers.length) return [];

  return layouts.flatMap((layout) => {
    const serverDir = path.join(bundledPluginsDir, directory, layout.dir);
    if (layout.name === 'compiled' && !fs.existsSync(serverDir)) return [];
    const files = fs.existsSync(serverDir)
      ? fs
          .readdirSync(serverDir)
          .filter((file) => layout.pattern.test(file))
          .map((file) => path.join(serverDir, file))
      : [];
    return [{ directory, layout: layout.name, handlers, files }];
  });
});

describe('bundled plugin route handlers in a plain Node process', () => {
  const results = loadInNode(cases.flatMap((entry) => entry.files));

  it('covers the SCM plugins', () => {
    expect(cases.filter((entry) => entry.layout === 'source').map((entry) => entry.directory)).toEqual(
      expect.arrayContaining(['plugin-github', 'plugin-gitlab', 'plugin-bitbucket']),
    );
  });

  it.each(cases.map((entry) => [`${entry.directory} (${entry.layout})`, entry] as const))(
    '%s loads every handler module and exports every manifest route handler',
    (_label, entry) => {
      const failures = entry.files.flatMap((file) => {
        const result = results[file];
        return 'error' in result ? [`${path.basename(file)}: ${result.error}`] : [];
      });
      const exported = new Set(
        entry.files.flatMap((file) => {
          const result = results[file];
          return 'exports' in result ? result.exports : [];
        }),
      );

      expect(failures).toEqual([]);
      expect(entry.handlers.filter((handler) => !exported.has(handler))).toEqual([]);
    },
  );
});
