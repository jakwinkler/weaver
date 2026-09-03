import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InstalledPluginEntity } from '@weaver/db';
import { PluginLoaderService } from './plugin-loader.service';
import { PluginContextFactory } from './plugin-context.factory';
import { requireTenantContext } from '../core/tenant';
import { TenantConnectionProvider } from '../core/tenant';
import { CustomFieldDefinitionEntity } from '@weaver/db';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class PluginRegistryService {
  private readonly logger = new Logger(PluginRegistryService.name);

  constructor(
    @InjectRepository(InstalledPluginEntity)
    private readonly repo: Repository<InstalledPluginEntity>,
    private readonly loader: PluginLoaderService,
    private readonly contextFactory: PluginContextFactory,
    private readonly tenantConnections: TenantConnectionProvider,
  ) {}

  async install(pluginId: string): Promise<InstalledPluginEntity> {
    const manifest = this.loader.getManifest(pluginId);
    if (!manifest) {
      throw new NotFoundException(`Plugin not found: ${pluginId}`);
    }

    const tenant = requireTenantContext();
    const existing = await this.repo.findOne({
      where: { tenantId: tenant.tenantId, pluginId },
    });
    if (existing) {
      throw new ConflictException(`Plugin already installed: ${pluginId}`);
    }

    const plugin = this.repo.create({
      tenantId: tenant.tenantId,
      pluginId: manifest.id,
      version: manifest.version,
      enabled: true,
      settings: {},
    });
    const saved = await this.repo.save(plugin);

    // Call lifecycle hook
    try {
      const context = await this.contextFactory.create(pluginId, {});
      const mod = await this.loader.getModule(pluginId);

      if (mod?.onInstall) {
        await mod.onInstall(context);
      } else if (manifest.migrations && manifest.migrations.length > 0) {
        // Fallback: run migration SQL files if no onInstall hook
        const pluginDir = this.loader.getPluginDir(pluginId);
        if (pluginDir) {
          for (const migrationFile of manifest.migrations) {
            const migrationPath = path.join(pluginDir, migrationFile);
            if (fs.existsSync(migrationPath)) {
              const sql = fs.readFileSync(migrationPath, 'utf-8');
              await context.db.runMigration(sql);
              this.logger.log(`Ran migration: ${migrationFile} for ${pluginId}`);
            }
          }
        }
      }
    } catch (err) {
      this.logger.error(`Failed to run onInstall for plugin ${pluginId}: ${err}`);
      await this.repo.delete({ id: saved.id });
      throw err;
    }

    return saved;
  }

  async uninstall(pluginId: string): Promise<void> {
    const tenant = requireTenantContext();

    // Call lifecycle hook before deleting
    try {
      const installed = await this.repo.findOne({
        where: { tenantId: tenant.tenantId, pluginId },
      });
      if (installed) {
        const context = await this.contextFactory.create(pluginId, installed.settings);
        const mod = await this.loader.getModule(pluginId);
        if (mod?.onUninstall) {
          await mod.onUninstall(context);
        }
      }
    } catch (err) {
      this.logger.warn(`Failed to run onUninstall for plugin ${pluginId}: ${err}`);
    }

    // Clean up plugin-owned custom fields
    try {
      const em = await this.tenantConnections.getEntityManager();
      const cfRepo = em.getRepository(CustomFieldDefinitionEntity);
      await cfRepo.delete({ pluginId });
      this.logger.log(`Cleaned up custom fields for plugin: ${pluginId}`);
    } catch (err) {
      this.logger.warn(`Failed to clean up custom fields for plugin ${pluginId}: ${err}`);
    }

    const result = await this.repo.delete({
      tenantId: tenant.tenantId,
      pluginId,
    });
    if (result.affected === 0) {
      throw new NotFoundException(`Plugin not installed: ${pluginId}`);
    }
  }

  async enable(pluginId: string): Promise<InstalledPluginEntity> {
    return this.updateEnabled(pluginId, true);
  }

  async disable(pluginId: string): Promise<InstalledPluginEntity> {
    return this.updateEnabled(pluginId, false);
  }

  async updateSettings(
    pluginId: string,
    settings: Record<string, unknown>,
  ): Promise<InstalledPluginEntity> {
    const plugin = await this.findInstalled(pluginId);
    plugin.settings = { ...plugin.settings, ...settings };
    return this.repo.save(plugin);
  }

  async getInstalled(): Promise<InstalledPluginEntity[]> {
    const tenant = requireTenantContext();
    return this.repo.find({ where: { tenantId: tenant.tenantId } });
  }

  async findInstalled(pluginId: string): Promise<InstalledPluginEntity> {
    const tenant = requireTenantContext();
    const plugin = await this.repo.findOne({
      where: { tenantId: tenant.tenantId, pluginId },
    });
    if (!plugin) {
      throw new NotFoundException(`Plugin not installed: ${pluginId}`);
    }
    return plugin;
  }

  private async updateEnabled(
    pluginId: string,
    enabled: boolean,
  ): Promise<InstalledPluginEntity> {
    const plugin = await this.findInstalled(pluginId);
    plugin.enabled = enabled;
    const saved = await this.repo.save(plugin);

    // Call lifecycle hook
    try {
      const context = await this.contextFactory.create(pluginId, plugin.settings);
      const mod = await this.loader.getModule(pluginId);
      if (enabled && mod?.onEnable) {
        await mod.onEnable(context);
      } else if (!enabled && mod?.onDisable) {
        await mod.onDisable(context);
      }
    } catch (err) {
      this.logger.warn(`Failed to run ${enabled ? 'onEnable' : 'onDisable'} for plugin ${pluginId}: ${err}`);
    }

    return saved;
  }
}
