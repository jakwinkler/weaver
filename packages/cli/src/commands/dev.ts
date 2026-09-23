import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { Command } from 'commander';

import { validatePlugin } from '../manifest';
import { runVite } from '../vite-process';
import { printValidation } from './validate';

interface DevOptions {
  weaverUrl: string;
  host: string;
  port?: string;
}

export async function devPlugin(pluginDirectory: string, options: DevOptions): Promise<void> {
  const pluginRoot = resolve(pluginDirectory);
  const result = validatePlugin(pluginRoot);
  printValidation(result, pluginRoot);
  if (result.errors.length > 0) {
    throw new Error(`Dev server stopped because the manifest has ${result.errors.length} error(s)`);
  }
  const configPath = join(pluginRoot, 'vite.config.ts');
  if (!existsSync(configPath)) {
    throw new Error('No vite.config.ts found. This plugin does not include a client bundle.');
  }

  const args = ['--config', configPath, '--host', options.host];
  if (options.port) args.push('--port', options.port);
  await runVite(args, {
    cwd: pluginRoot,
    env: { WEAVER_URL: options.weaverUrl },
  });
}

export function registerDevCommand(program: Command): void {
  program
    .command('dev')
    .description('Start the plugin Vite server with HMR and a Weaver API proxy')
    .argument('[directory]', 'plugin directory', process.cwd())
    .option('--weaver-url <url>', 'main Weaver instance', 'http://localhost:3000')
    .option('--host <host>', 'dev server host', 'localhost')
    .option('--port <port>', 'dev server port')
    .action(devPlugin);
}
