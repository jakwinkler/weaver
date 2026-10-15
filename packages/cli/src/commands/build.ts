import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { Command } from 'commander';

import { validatePlugin } from '../manifest';
import { buildServer } from '../server-build';
import { runVite } from '../vite-process';
import { printValidation } from './validate';

interface ManifestEntrypoints {
  client?: string;
  server?: string;
}

function readEntrypoints(pluginRoot: string): ManifestEntrypoints {
  // Validation has already checked that the manifest parses and entrypoints is an object.
  const manifest = JSON.parse(readFileSync(join(pluginRoot, 'weaver-plugin.json'), 'utf8')) as {
    entrypoints: ManifestEntrypoints;
  };
  return manifest.entrypoints;
}

export async function buildPlugin(pluginDirectory: string): Promise<void> {
  const pluginRoot = resolve(pluginDirectory);
  const result = validatePlugin(pluginRoot);
  printValidation(result, pluginRoot);
  if (result.errors.length > 0) {
    throw new Error(`Build stopped because the manifest has ${result.errors.length} error(s)`);
  }

  const entrypoints = readEntrypoints(pluginRoot);
  if (!entrypoints.client && !entrypoints.server) {
    throw new Error('Nothing to build. The manifest declares no client or server entrypoint.');
  }

  if (entrypoints.client) {
    const configPath = join(pluginRoot, 'vite.config.ts');
    if (!existsSync(configPath)) {
      throw new Error('No vite.config.ts found. It is required to build entrypoints.client.');
    }
    await runVite(['build', '--config', configPath], { cwd: pluginRoot });
  }

  if (entrypoints.server) {
    const runtimeEntrypoint = await buildServer(pluginRoot, entrypoints.server);
    process.stdout.write(`Server code compiled: ${runtimeEntrypoint}\n`);
  }
}

export function registerBuildCommand(program: Command): void {
  program
    .command('build')
    .description('Validate the plugin, build its client bundle, and compile its server code')
    .argument('[directory]', 'plugin directory', process.cwd())
    .action(buildPlugin);
}
