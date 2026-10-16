import { spawn } from 'node:child_process';

export interface RunProcessOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
}

export async function runProcess(
  name: string,
  command: string,
  args: string[],
  options: RunProcessOptions,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: 'inherit',
    });

    child.once('error', (error) => {
      reject(
        new Error(
          `Unable to start ${name}. Install the plugin dependencies first. ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    });
    child.once('exit', (code, signal) => {
      if (signal) reject(new Error(`${name} stopped after receiving ${signal}`));
      else if (code === 0) resolve();
      else reject(new Error(`${name} exited with status ${code ?? 'unknown'}`));
    });
  });
}
