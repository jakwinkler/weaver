import { spawn } from 'node:child_process';

interface RunViteOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
}

export async function runVite(args: string[], options: RunViteOptions): Promise<void> {
  const command = process.platform === 'win32' ? 'vite.cmd' : 'vite';
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: 'inherit',
    });

    child.once('error', (error) => {
      reject(
        new Error(
          `Unable to start Vite. Install the plugin dependencies first. ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    });
    child.once('exit', (code, signal) => {
      if (signal) reject(new Error(`Vite stopped after receiving ${signal}`));
      else if (code === 0) resolve();
      else reject(new Error(`Vite exited with status ${code ?? 'unknown'}`));
    });
  });
}
