import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { Command } from 'commander';

import { validatePlugin } from '../manifest';
import { runVite } from '../vite-process';
import { printValidation } from './validate';

export async function buildPlugin(pluginDirectory: string): Promise<void> {
  const pluginRoot = resolve(pluginDirectory);
  const result = validatePlugin(pluginRoot);
  printValidation(result, pluginRoot);
  if (result.errors.length > 0) {
    throw new Error(`Build stopped because the manifest has ${result.errors.length} error(s)`);
  }
  const configPath = join(pluginRoot, 'vite.config.ts');
  if (!existsSync(configPath)) {
    throw new Error('No vite.config.ts found. This plugin does not include a client bundle.');
  }
  await runVite(['build', '--config', configPath], { cwd: pluginRoot });
}

export function registerBuildCommand(program: Command): void {
  program
    .command('build')
    .description('Validate and compile the current plugin client bundle')
    .argument('[directory]', 'plugin directory', process.cwd())
    .action(buildPlugin);
}
