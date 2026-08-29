import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomFieldDefinitionEntity, InstalledPluginEntity } from '@weaver/db';
import type { PluginContext, PluginManifest, PluginMigration, WeaverPlugin } from '@weaver/sdk';
import { PluginLoaderService } from './plugin-loader.service';
import { PluginContextFactory } from './plugin-context.factory';
import { requireTenantContext, tenantStorage, TenantConnectionProvider } from '../core/tenant';
import * as fs from 'fs';
import * as path from 'path';
import type { PluginSettingDefinition } from '@weaver/sdk';

export interface PluginUpgradeLogEntry {
  pluginId: string;
  fromVersion: string;
  toVersion: string;
  success: boolean;
  error: string | null;
  timestamp: string;
}

@Injectable()
export class PluginRegistryService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PluginRegistryService.name);
  private readonly upgradeLog: PluginUpgradeLogEntry[] = [];

  constructor(
    @InjectRepository(InstalledPluginEntity)
    private readonly repo: Repository<InstalledPluginEntity>,
    private readonly loader: PluginLoaderService,
    private readonly contextFactory: PluginContextFactory,
    private readonly tenantConnections: TenantConnectionProvider,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    let installedPlugins: InstalledPluginEntity[];

    try {
      installedPlugins = await this.repo.find({ relations: { tenant: true } });
    } catch (error) {
      this.logger.error(
        `Failed to inspect installed plugins for upgrades: ${this.getErrorMessage(error)}`,
      );
      return;
    }

    for (const installed of installedPlugins) {
      const manifest = this.loader.getManifest(installed.pluginId);
      if (!manifest) continue;

      try {
        if (this.compareVersions(manifest.version, installed.version) <= 0) {
          continue;
        }
      } catch (error) {
        this.recordUpgrade(installed, manifest, false, this.getErrorMessage(error));
        continue;
      }

      if (!installed.tenant?.schemaName) {
        this.recordUpgrade(
          installed,
          manifest,
          false,
          `Tenant schema is unavailable for tenant ${installed.tenantId}`,
        );
        continue;
      }

      await tenantStorage.run(
        {
          tenantId: installed.tenantId,
          schemaName: installed.tenant.schemaName,
        },
        () => this.upgrade(installed, manifest),
      );
    }
  }

  getUpgradeLog(): readonly PluginUpgradeLogEntry[] {
    return [...this.upgradeLog];
  }

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
      const lifecycle = this.getLifecycle(mod);

      if (lifecycle?.onInstall) {
        await lifecycle.onInstall(context);
      } else if (manifest.migrations && manifest.migrations.length > 0) {
        // Fallback: run migration SQL files if no onInstall hook
        const pluginDir = this.loader.getPluginDir(pluginId);
        if (pluginDir) {
          for (const migration of manifest.migrations) {
            const migrationFile = typeof migration === 'string' ? migration : migration.sql;
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

  private async upgrade(installed: InstalledPluginEntity, manifest: PluginManifest): Promise<void> {
    const fromVersion = installed.version;

    try {
      const context = await this.contextFactory.create(installed.pluginId, installed.settings);
      await this.runUpgradeMigrations(installed.pluginId, fromVersion, manifest, context);

      const mod = await this.loader.getModule(installed.pluginId);
      if (manifest.entrypoints.server && !mod) {
        throw new Error('Plugin server module could not be loaded');
      }
      const lifecycle = this.getLifecycle(mod);
      if (lifecycle?.onUpgrade) {
        await lifecycle.onUpgrade(fromVersion, manifest.version, context);
      }

      installed.version = manifest.version;
      try {
        await this.repo.save(installed);
      } catch (error) {
        installed.version = fromVersion;
        throw error;
      }

      this.recordUpgrade(installed, manifest, true, null, fromVersion);
    } catch (error) {
      this.recordUpgrade(installed, manifest, false, this.getErrorMessage(error), fromVersion);
    }
  }

  private async runUpgradeMigrations(
    pluginId: string,
    fromVersion: string,
    manifest: PluginManifest,
    context: PluginContext,
  ): Promise<void> {
    const migrations = (manifest.migrations ?? [])
      .filter((migration): migration is PluginMigration => typeof migration !== 'string')
      .filter(
        (migration) =>
          this.compareVersions(migration.version, fromVersion) > 0 &&
          this.compareVersions(migration.version, manifest.version) <= 0,
      )
      .sort((a, b) => this.compareVersions(a.version, b.version));

    if (migrations.length === 0) return;

    const pluginDir = this.loader.getPluginDir(pluginId);
    if (!pluginDir) {
      throw new Error('Plugin directory could not be resolved');
    }

    const pluginRoot = path.resolve(pluginDir);
    for (const migration of migrations) {
      const migrationPath = path.resolve(pluginRoot, migration.sql);
      if (migrationPath !== pluginRoot && !migrationPath.startsWith(`${pluginRoot}${path.sep}`)) {
        throw new Error(`Migration path is outside the plugin directory: ${migration.sql}`);
      }

      const sql = fs.readFileSync(migrationPath, 'utf-8');
      await context.db.runMigration(sql);
      this.logger.log(
        `Ran upgrade migration ${migration.sql} (${migration.version}) for ${pluginId}`,
      );
    }
  }

  private compareVersions(left: string, right: string): number {
    const leftVersion = this.parseVersion(left);
    const rightVersion = this.parseVersion(right);

    for (let index = 0; index < 3; index += 1) {
      const difference = leftVersion.core[index] - rightVersion.core[index];
      if (difference !== 0) return Math.sign(difference);
    }

    if (leftVersion.prerelease.length === 0) {
      return rightVersion.prerelease.length === 0 ? 0 : 1;
    }
    if (rightVersion.prerelease.length === 0) return -1;

    const length = Math.max(leftVersion.prerelease.length, rightVersion.prerelease.length);
    for (let index = 0; index < length; index += 1) {
      const leftPart = leftVersion.prerelease[index];
      const rightPart = rightVersion.prerelease[index];
      if (leftPart === undefined) return -1;
      if (rightPart === undefined) return 1;
      if (leftPart === rightPart) continue;

      const leftNumber = /^\d+$/.test(leftPart) ? Number(leftPart) : null;
      const rightNumber = /^\d+$/.test(rightPart) ? Number(rightPart) : null;
      if (leftNumber !== null && rightNumber !== null) {
        return Math.sign(leftNumber - rightNumber);
      }
      if (leftNumber !== null) return -1;
      if (rightNumber !== null) return 1;
      return leftPart < rightPart ? -1 : 1;
    }

    return 0;
  }

  private parseVersion(version: string): {
    core: [number, number, number];
    prerelease: string[];
  } {
    const match = version.match(
      /^(?:v)?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/,
    );
    if (!match) {
      throw new Error(`Invalid semantic version: ${version}`);
    }

    return {
      core: [Number(match[1]), Number(match[2]), Number(match[3])],
      prerelease: match[4]?.split('.') ?? [],
    };
  }

  private recordUpgrade(
    installed: InstalledPluginEntity,
    manifest: PluginManifest,
    success: boolean,
    error: string | null,
    fromVersion = installed.version,
  ): void {
    const entry: PluginUpgradeLogEntry = {
      pluginId: installed.pluginId,
      fromVersion,
      toVersion: manifest.version,
      success,
      error,
      timestamp: new Date().toISOString(),
    };
    this.upgradeLog.push(entry);

    const message = `Plugin upgrade ${success ? 'succeeded' : 'failed'}: ${JSON.stringify(entry)}`;
    if (success) {
      this.logger.log(message);
    } else {
      this.logger.error(message);
    }
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private getLifecycle(mod: unknown): WeaverPlugin | undefined {
    if (!mod || (typeof mod !== 'object' && typeof mod !== 'function')) {
      return undefined;
    }

    const pluginModule = mod as {
      plugin?: WeaverPlugin;
      default?: WeaverPlugin;
    };
    return pluginModule.plugin ?? pluginModule.default ?? (mod as WeaverPlugin);
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
        const lifecycle = this.getLifecycle(mod);
        if (lifecycle?.onUninstall) {
          await lifecycle.onUninstall(context);
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
        !definition.required && (submittedValue === '' || submittedValue === null);
      const matchesDefault =
        definition.default !== undefined && Object.is(submittedValue, definition.default);

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

  private async updateEnabled(pluginId: string, enabled: boolean): Promise<InstalledPluginEntity> {
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
      const lifecycle = this.getLifecycle(mod);
      if (enabled && lifecycle?.onEnable) {
        await lifecycle.onEnable(context);
      } else if (!enabled && lifecycle?.onDisable) {
        await lifecycle.onDisable(context);
      }
    } catch (err) {
      this.logger.warn(
        `Failed to run ${enabled ? 'onEnable' : 'onDisable'} for plugin ${pluginId}: ${err}`,
      );
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
