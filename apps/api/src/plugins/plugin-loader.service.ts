import { assertContainedPluginPath } from './plugin-path';
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import type { PluginManifest, RouteHandler } from '@weaver/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { parsePluginManifest } from './plugin-manifest.schema';

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
    this.pluginsDir = this.resolveDefaultPluginsDirectory();
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
      this.watcher = fs.watch(this.pluginsDir, { recursive: true }, (_eventType, filename) => {
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
      });
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
        const manifest: PluginManifest = parsePluginManifest(JSON.parse(raw));
        if (!this.isPluginTrusted(manifest.id)) {
          this.logger.warn(`Skipping untrusted production plugin: ${manifest.id}`);
          continue;
        }
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

  getAllClientManifests(): PluginManifest[] {
    return this.getAllManifests().map((manifest) => {
      if (!manifest.entrypoints.client) return manifest;

      return {
        ...manifest,
        clientBundle: this.getClientBundleUrl(manifest.id),
      };
    });
  }

  getClientBundleUrl(pluginId: string): string {
    const prefix = (process.env.API_PREFIX || 'api/v1').replace(/^\/+|\/+$/g, '');
    const pluginPath = pluginId
      .split('/')
      .map((segment) => encodeURIComponent(segment).replace('%40', '@'))
      .join('/');
    return `/${prefix}/plugin-assets/${pluginPath}/remoteEntry.js`;
  }

  getPluginDevServerUrl(pluginId: string): string | undefined {
    if (process.env.NODE_ENV === 'production') return undefined;

    const raw = process.env.WEAVER_PLUGIN_DEV_SERVERS;
    if (!raw) return undefined;

    try {
      const servers = JSON.parse(raw) as Record<string, unknown>;
      const value = servers[pluginId];
      if (typeof value !== 'string') return undefined;
      const url = new URL(value);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
      return url.toString().replace(/\/$/, '');
    } catch (error) {
      this.logger.warn(`Ignoring invalid WEAVER_PLUGIN_DEV_SERVERS: ${error}`);
      return undefined;
    }
  }

  resolveClientAsset(requestPath: string): string | undefined {
    let decodedPath: string;
    try {
      decodedPath = requestPath
        .split('/')
        .map((segment) => decodeURIComponent(segment))
        .join('/');
    } catch {
      return undefined;
    }

    const pluginId = Array.from(this.manifests.keys())
      .sort((left, right) => right.length - left.length)
      .find((id) => decodedPath.startsWith(`${id}/`));
    if (!pluginId) return undefined;

    const pluginDir = this.getPluginDir(pluginId);
    if (!pluginDir) return undefined;

    const assetPath = decodedPath.slice(pluginId.length + 1);
    if (!assetPath) return undefined;

    const clientRoot = path.resolve(pluginDir, 'dist/client');
    const resolved = path.resolve(clientRoot, assetPath);
    if (!resolved.startsWith(`${clientRoot}${path.sep}`)) return undefined;
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return undefined;

    return resolved;
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
      const loaded = this.requirePlugin(entrypoint, pluginDir);
      const mod = loaded.plugin ?? loaded;
      this.modules.set(pluginId, mod);
      return mod;
    } catch (err) {
      this.logger.error(`Failed to load module for plugin ${pluginId}: ${err}`);
      return undefined;
    }
  }

  async getHandler(pluginId: string, handlerName: string): Promise<RouteHandler | undefined> {
    const manifest = this.manifests.get(pluginId);
    const pluginDir = this.getPluginDir(pluginId);
    if (!manifest || !pluginDir || !manifest.entrypoints.server) {
      return undefined;
    }

    const entrypoint = path.resolve(pluginDir, manifest.entrypoints.server);
    assertContainedPluginPath(pluginDir, entrypoint, false);
    const sourceServerDir = path.dirname(entrypoint);
    const runtimeServerDir = this.toRuntimeServerPath(sourceServerDir);
    const candidates = [path.join(sourceServerDir, 'handlers')];
    if (fs.existsSync(runtimeServerDir)) {
      assertContainedPluginPath(pluginDir, runtimeServerDir);
      for (const filename of fs.readdirSync(runtimeServerDir)) {
        if (/\.handler\.(?:js|ts)$/.test(filename)) {
          candidates.push(path.join(sourceServerDir, filename.replace(/\.(?:js|ts)$/, '')));
        }
      }
    }

    for (const candidate of candidates) {
      try {
        const handlers = this.requirePlugin(candidate, pluginDir);
        if (typeof handlers[handlerName] === 'function') {
          return handlers[handlerName];
        }
      } catch {
        // Try the next supported handler module convention.
      }
    }

    this.logger.error(
      `Failed to load handler ${handlerName} for plugin ${pluginId}`,
    );
    return undefined;
  }

  /** Resolve and load a plugin module, trying .ts then .js extensions */
  private requirePlugin(modulePath: string, pluginDir: string): any {
    assertContainedPluginPath(pluginDir, modulePath, false);
    const resolved = this.resolvePluginPath(modulePath);
    assertContainedPluginPath(pluginDir, resolved);
    // Clear require cache in dev mode so plugin code changes are picked up
    if (process.env.NODE_ENV !== 'production') {
      delete require.cache[resolved];
    }
    return require(resolved);
  }

  private resolvePluginPath(modulePath: string): string {
    modulePath = this.toRuntimeServerPath(modulePath);
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

  private toRuntimeServerPath(modulePath: string): string {
    if (process.env.NODE_ENV !== 'production') return modulePath;

    return modulePath
      .replace(
        `${path.sep}src${path.sep}server`,
        `${path.sep}dist${path.sep}server`,
      )
      .replace(/\.ts$/, '.js');
  }

  private resolveDefaultPluginsDirectory(): string {
    if (process.env.WEAVER_PLUGINS_DIR) {
      return path.resolve(process.env.WEAVER_PLUGINS_DIR);
    }

    const candidates = [
      path.resolve(process.cwd(), 'plugins'),
      path.resolve(process.cwd(), '../../plugins'),
    ];
    return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
  }

  private isPluginTrusted(pluginId: string): boolean {
    if (process.env.NODE_ENV !== 'production') {
      return true;
    }

    const trusted = new Set(
      (process.env.WEAVER_TRUSTED_PLUGINS || '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    );
    return trusted.has(pluginId);
  }
}
