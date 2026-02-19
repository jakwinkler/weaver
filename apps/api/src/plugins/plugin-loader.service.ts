import { Injectable, Logger } from '@nestjs/common';
import type { PluginManifest } from '@weaver/sdk';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class PluginLoaderService {
  private readonly logger = new Logger(PluginLoaderService.name);
  private manifests = new Map<string, PluginManifest>();

  async loadPlugins(pluginsDir: string): Promise<void> {
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
}
