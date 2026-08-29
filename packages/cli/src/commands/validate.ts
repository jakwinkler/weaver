import { resolve } from 'node:path';

import type { Command } from 'commander';

import { formatValidationIssue, validatePlugin, type ValidationResult } from '../manifest';

export function printValidation(result: ValidationResult, pluginRoot: string): void {
  for (const warning of result.warnings)
    process.stderr.write(`${formatValidationIssue(warning)}\n`);
  for (const error of result.errors) process.stderr.write(`${formatValidationIssue(error)}\n`);
  if (result.errors.length === 0) {
    process.stdout.write(
      `Manifest is valid: ${resolve(pluginRoot, 'weaver-plugin.json')}${
        result.warnings.length > 0 ? ` (${result.warnings.length} warning(s))` : ''
      }\n`,
    );
  }
}

export function registerValidateCommand(program: Command): void {
  program
    .command('validate')
    .description('Validate a Weaver plugin manifest and its references')
    .argument('[directory]', 'plugin directory', process.cwd())
    .option('--json', 'print machine-readable results')
    .action((directory: string, options: { json?: boolean }) => {
      const result = validatePlugin(directory);
      if (options.json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      } else {
        printValidation(result, directory);
      }
      if (result.errors.length > 0) process.exitCode = 1;
    });
}
