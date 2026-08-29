import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
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
import type { PluginSettingDefinition } from '@weaver/sdk';

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
      const context = await this.contextFactory.create(
        pluginId,
        this.mergeSettingsWithDefaults(pluginId, {}),
      );
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
        const context = await this.contextFactory.create(
          pluginId,
          this.mergeSettingsWithDefaults(pluginId, installed.settings),
        );
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

    if (!this.isSettingsObject(settings)) {
      throw new BadRequestException({
        message: 'Invalid plugin settings',
        errors: { settings: 'Settings must be an object' },
      });
    }

    const manifest = this.loader.getManifest(pluginId);
    const schema = manifest?.settings?.schema;
    if (schema) {
      const candidate = this.mergeSettingsWithDefaults(pluginId, {
        ...plugin.settings,
        ...settings,
      });
      const errors = this.validateSettings(schema, candidate, settings);
      if (Object.keys(errors).length > 0) {
        throw new BadRequestException({
          message: 'Invalid plugin settings',
          errors,
        });
      }
    }

    const storedSettings = { ...plugin.settings, ...settings };
    for (const [key, definition] of Object.entries(schema ?? {})) {
      if (!Object.prototype.hasOwnProperty.call(settings, key)) continue;

      const submittedValue = settings[key];
      const clearsOptionalValue =
        !definition.required &&
        (submittedValue === '' || submittedValue === null);
      const matchesDefault =
        definition.default !== undefined &&
        Object.is(submittedValue, definition.default);

      if (clearsOptionalValue || matchesDefault) {
        delete storedSettings[key];
      }
    }

    plugin.settings = storedSettings;
    return this.repo.save(plugin);
  }

  async getSettings(pluginId: string): Promise<Record<string, unknown>> {
    const plugin = await this.findInstalled(pluginId);
    return this.mergeSettingsWithDefaults(pluginId, plugin.settings);
  }

  mergeSettingsWithDefaults(
    pluginId: string,
    settings: Record<string, unknown>,
  ): Record<string, unknown> {
    const schema = this.loader.getManifest(pluginId)?.settings?.schema ?? {};
    const defaults = Object.fromEntries(
      Object.entries(schema)
        .filter(([, definition]) => definition.default !== undefined)
        .map(([key, definition]) => [key, definition.default]),
    );

    return { ...defaults, ...settings };
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
      const context = await this.contextFactory.create(
        pluginId,
        this.mergeSettingsWithDefaults(pluginId, plugin.settings),
      );
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

  private isSettingsObject(settings: unknown): settings is Record<string, unknown> {
    return settings !== null && typeof settings === 'object' && !Array.isArray(settings);
  }

  private validateSettings(
    schema: Record<string, PluginSettingDefinition>,
    effectiveSettings: Record<string, unknown>,
    submittedSettings: Record<string, unknown>,
  ): Record<string, string> {
    const errors: Record<string, string> = {};

    for (const key of Object.keys(submittedSettings)) {
      if (!schema[key]) {
        errors[key] = 'Unknown setting';
      }
    }

    for (const [key, definition] of Object.entries(schema)) {
      const value = effectiveSettings[key];
      const label = definition.label || this.humanizeSettingKey(key);
      const isMissing = value === undefined || value === null || value === '';

      if (definition.required && isMissing) {
        errors[key] = `${label} is required`;
        continue;
      }

      if (isMissing) continue;

      if (
        (definition.type === 'string' || definition.type === 'textarea') &&
        typeof value !== 'string'
      ) {
        errors[key] = `${label} must be a string`;
      } else if (
        definition.type === 'number' &&
        (typeof value !== 'number' || !Number.isFinite(value))
      ) {
        errors[key] = `${label} must be a number`;
      } else if (definition.type === 'boolean' && typeof value !== 'boolean') {
        errors[key] = `${label} must be a boolean`;
      } else if (
        definition.type === 'select' &&
        (typeof value !== 'string' || !definition.options?.includes(value))
      ) {
        errors[key] = `${label} must be one of: ${(definition.options ?? []).join(', ')}`;
      }
    }

    return errors;
  }

  private humanizeSettingKey(key: string): string {
    const spaced = key
      .replace(
        /([a-z0-9])([A-Z])/g,
        (_match, before: string, uppercase: string) => `${before} ${uppercase.toLowerCase()}`,
      )
      .replace(/[_-]+/g, ' ')
      .trim();
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
  }
}
