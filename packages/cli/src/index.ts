import { Command } from 'commander';

import { registerBuildCommand } from './commands/build';
import { registerCreatePluginCommand } from './commands/create-plugin';
import { registerDevCommand } from './commands/dev';
import { registerValidateCommand } from './commands/validate';

export function createProgram(): Command {
  const program = new Command();
  program
    .name('weaver')
    .description('Create, validate, develop, and build Weaver plugins')
    .version('0.0.1');
  registerCreatePluginCommand(program);
  registerDevCommand(program);
  registerBuildCommand(program);
  registerValidateCommand(program);
  return program;
}

export async function runCli(argv = process.argv): Promise<void> {
  await createProgram().parseAsync(argv);
}

export { createPlugin, validatePluginName } from './commands/create-plugin';
export { validatePlugin } from './manifest';
