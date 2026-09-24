import * as fs from 'fs';
import * as path from 'path';

export function assertContainedPluginPath(pluginDir: string, target: string, real = true): void {
  const base = real ? fs.realpathSync(pluginDir) : path.resolve(pluginDir);
  const resolved = real ? fs.realpathSync(target) : path.resolve(target);
  const relative = path.relative(base, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('Plugin path escapes its directory');
  }
}
