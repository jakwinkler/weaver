import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { runProcess } from './run-process';

export const SERVER_TSCONFIG = 'tsconfig.server.json';
export const SERVER_OUTPUT_DIRECTORY = 'dist/server';

/**
 * The file the API loads for a server entrypoint when NODE_ENV is production.
 * Mirrors toRuntimeServerPath in apps/api/src/plugins/plugin-loader.service.ts.
 */
export function runtimeServerPath(entrypoint: string): string {
  return entrypoint
    .split('\\')
    .join('/')
    .replace(/^\.\//, '')
    .replace(/^src\/server\//, `${SERVER_OUTPUT_DIRECTORY}/`)
    .replace(/\.ts$/, '.js');
}

function resolveTypeScriptCompiler(pluginRoot: string): string {
  try {
    return require.resolve('typescript/bin/tsc', { paths: [pluginRoot] });
  } catch {
    throw new Error('Unable to find TypeScript. Install the plugin dependencies first.');
  }
}

/** Compiles the server code to CommonJS and returns the runtime entrypoint, relative to the plugin. */
export async function buildServer(pluginRoot: string, entrypoint: string): Promise<string> {
  const configPath = join(pluginRoot, SERVER_TSCONFIG);
  if (!existsSync(configPath)) {
    throw new Error(
      `No ${SERVER_TSCONFIG} found. In production the API loads server code from ` +
        `${SERVER_OUTPUT_DIRECTORY} as JavaScript, so this plugin needs one that compiles src/server ` +
        'there. Plugins created with weaver create-plugin include it.',
    );
  }

  const compiler = resolveTypeScriptCompiler(pluginRoot);
  // tsc never deletes output, and the API scans this directory for *.handler.js files.
  rmSync(join(pluginRoot, SERVER_OUTPUT_DIRECTORY), { recursive: true, force: true });
  await runProcess('TypeScript', process.execPath, [compiler, '-p', configPath], {
    cwd: pluginRoot,
  });

  const runtimeEntrypoint = runtimeServerPath(entrypoint);
  if (!existsSync(join(pluginRoot, runtimeEntrypoint))) {
    throw new Error(
      `The server build did not write ${runtimeEntrypoint}, which the API loads in production. ` +
        `Check rootDir and outDir in ${SERVER_TSCONFIG}.`,
    );
  }
  return runtimeEntrypoint;
}
