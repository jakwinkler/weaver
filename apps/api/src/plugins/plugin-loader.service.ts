import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import type { PluginManifest } from '@weaver/sdk';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class PluginLoaderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PluginLoaderService.name);
  private manifests = new Map<string, PluginManifest>();
  private pluginDirs = new Map<string, string>();
  private modules = new Map<string, any>();
  private pluginsDir = '';
  private watcher: fs.FSWatcher | null = null;
  private reloadTimer: ReturnType<typeof setTimeout> | null = null;

  async onModuleInit(): Promise<void> {
    this.pluginsDir = path.resolve(process.cwd(), '../../plugins');
    await this.loadPlugins(this.pluginsDir);

    if (process.env.NODE_ENV !== 'production') {
      this.watchPlugins();
    }
  }

  onModuleDestroy(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
    }
  }

  private watchPlugins(): void {
    if (!fs.existsSync(this.pluginsDir)) return;

    try {
      this.watcher = fs.watch(
        this.pluginsDir,
        { recursive: true },
        (_eventType, filename) => {
          if (!filename) return;
          // Only react to manifest or server source changes
          if (
            !filename.endsWith('weaver-plugin.json') &&
            !filename.includes(path.join('src', 'server'))
          ) {
            return;
          }

          // Debounce: batch rapid file changes into a single reload
          if (this.reloadTimer) clearTimeout(this.reloadTimer);
          this.reloadTimer = setTimeout(() => {
            this.logger.log(`Plugin change detected (${filename}), reloading...`);
            this.reload();
          }, 300);
        },
      );
      this.logger.log('Watching plugins directory for changes');
    } catch (err) {
      this.logger.warn(`Failed to watch plugins directory: ${err}`);
    }
  }

  private reload(): void {
    const oldIds = new Set(this.manifests.keys());
    this.manifests.clear();
    this.pluginDirs.clear();
    this.modules.clear(); // Clear module cache so handlers get re-imported
    this.loadPlugins(this.pluginsDir).then(() => {
      const newIds = new Set(this.manifests.keys());
      const added = [...newIds].filter((id) => !oldIds.has(id));
      const removed = [...oldIds].filter((id) => !newIds.has(id));
      if (added.length) this.logger.log(`New plugins detected: ${added.join(', ')}`);
      if (removed.length) this.logger.log(`Plugins removed: ${removed.join(', ')}`);
    });
  }

  async loadPlugins(pluginsDir: string): Promise<void> {
    this.pluginsDir = pluginsDir;

    if (!fs.existsSync(pluginsDir)) {
      this.logger.warn(`Plugins directory not found: ${pluginsDir}`);
      return;
    }

    const entries = fs.readdirSync(pluginsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(pluginsDir, entry.name, 'weaver-plugin.json');
      if (!fs.existsSync(manifestPath)) continue;

      try {
        const raw = fs.readFileSync(manifestPath, 'utf-8');
        const manifest: PluginManifest = JSON.parse(raw);
        this.manifests.set(manifest.id, manifest);
        this.pluginDirs.set(manifest.id, entry.name);
        this.logger.log(`Loaded plugin manifest: ${manifest.id} v${manifest.version}`);
      } catch (err) {
        this.logger.error(`Failed to load plugin manifest: ${manifestPath}`, err);
      }
    }
  }

  getManifest(pluginId: string): PluginManifest | undefined {
    return this.manifests.get(pluginId);
  }

  getAllManifests(): PluginManifest[] {
    return Array.from(this.manifests.values());
  }

  hasPlugin(pluginId: string): boolean {
    return this.manifests.has(pluginId);
  }

  getPluginDir(pluginId: string): string | undefined {
    const dirName = this.pluginDirs.get(pluginId);
    if (!dirName) return undefined;
    return path.join(this.pluginsDir, dirName);
  }

  async getModule(pluginId: string): Promise<any | undefined> {
    if (this.modules.has(pluginId)) {
      return this.modules.get(pluginId);
    }

    const manifest = this.manifests.get(pluginId);
    const pluginDir = this.getPluginDir(pluginId);
    if (!manifest || !pluginDir || !manifest.entrypoints.server) {
      return undefined;
    }

    try {
      const entrypoint = path.join(pluginDir, manifest.entrypoints.server);
      const mod = this.requirePlugin(entrypoint);
      this.modules.set(pluginId, mod);
      return mod;
    } catch (err) {
      this.logger.error(`Failed to load module for plugin ${pluginId}: ${err}`);
      return undefined;
    }
  }

  async getHandler(pluginId: string, handlerName: string): Promise<Function | undefined> {
    const manifest = this.manifests.get(pluginId);
    const pluginDir = this.getPluginDir(pluginId);
    if (!manifest || !pluginDir || !manifest.entrypoints.server) {
      return undefined;
    }

    try {
      // Handlers are in the same directory as the server entrypoint
      const serverDir = path.dirname(path.join(pluginDir, manifest.entrypoints.server));
      const handlersPath = path.join(serverDir, 'handlers');
      const handlers = this.requirePlugin(handlersPath);
      return handlers[handlerName];
    } catch (err) {
      this.logger.error(`Failed to load handler ${handlerName} for plugin ${pluginId}: ${err}`);
      return undefined;
    }
  }

  /** Resolve and load a plugin module, trying .ts then .js extensions */
  private requirePlugin(modulePath: string): any {
    const resolved = this.resolvePluginPath(modulePath);
    // Clear require cache in dev mode so plugin code changes are picked up
    if (process.env.NODE_ENV !== 'production') {
      delete require.cache[resolved];
    }
    return require(resolved);
  }

  private resolvePluginPath(modulePath: string): string {
    // Try exact path first (already has extension)
    if (fs.existsSync(modulePath)) return modulePath;
    // Try .ts (source)
    if (fs.existsSync(modulePath + '.ts')) return modulePath + '.ts';
    // Try .js (compiled)
    if (fs.existsSync(modulePath + '.js')) return modulePath + '.js';
    // Try index files
    if (fs.existsSync(path.join(modulePath, 'index.ts'))) return path.join(modulePath, 'index.ts');
    if (fs.existsSync(path.join(modulePath, 'index.js'))) return path.join(modulePath, 'index.js');
    // Fallback — let require() throw its own error
    return modulePath;
  }
}
