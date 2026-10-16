import { runProcess, type RunProcessOptions } from './run-process';

export async function runVite(args: string[], options: RunProcessOptions): Promise<void> {
  const command = process.platform === 'win32' ? 'vite.cmd' : 'vite';
  await runProcess('Vite', command, args, options);
}
