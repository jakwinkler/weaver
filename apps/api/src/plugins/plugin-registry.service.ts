import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InstalledPluginEntity } from '@weaver/db';
import type {
  PluginManifest,
  PluginMigration,
  PluginSettingDefinition,
  WeaverPlugin,
} from '@weaver/sdk';
import { PluginLoaderService } from './plugin-loader.service';
import { PluginContextFactory } from './plugin-context.factory';
import { requireTenantContext, tenantStorage } from '../core/tenant';
import * as fs from 'fs';
import * as path from 'path';

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
      if (!manifest || this.compareVersions(manifest.version, installed.version) <= 0) continue;
      const fromVersion = installed.version;

      if (!installed.tenant?.schemaName) {
        this.recordUpgrade(
          installed.pluginId,
          fromVersion,
          manifest.version,
          false,
          'Tenant schema is unavailable',
        );
        continue;
      }

      try {
        await tenantStorage.run(
          { tenantId: installed.tenantId, schemaName: installed.tenant.schemaName },
          () => this.upgrade(installed.pluginId),
        );
        this.recordUpgrade(installed.pluginId, fromVersion, manifest.version, true, null);
      } catch (error) {
        this.recordUpgrade(
          installed.pluginId,
          fromVersion,
          manifest.version,
          false,
          this.getErrorMessage(error),
        );
      }
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
    return this.repo.manager.transaction(async (manager) => {
      const transactionalRepo = manager.getRepository(InstalledPluginEntity);
      const existing = await transactionalRepo.findOne({
        where: { tenantId: tenant.tenantId, pluginId },
      });
      if (existing) {
        throw new ConflictException(`Plugin already installed: ${pluginId}`);
      }

      await this.assertPluginDependencies(manifest, transactionalRepo, tenant.tenantId);
      const context = await this.contextFactory.create(
        pluginId,
        this.mergeSettingsWithDefaults(pluginId, {}),
        undefined,
        {
          manager,
          capabilityState: { installed: false, enabled: false },
        },
      );
      const mod = await this.loader.getModule(pluginId);
      await this.runInstallLifecycle(manifest, this.getLifecycle(mod), context);

      const plugin = transactionalRepo.create({
        tenantId: tenant.tenantId,
        pluginId: manifest.id,
        version: manifest.version,
        enabled: manifest.enabledByDefault ?? true,
        settings: {},
      });
      return transactionalRepo.save(plugin);
    });
  }

  async upgrade(pluginId: string): Promise<InstalledPluginEntity> {
    const manifest = this.loader.getManifest(pluginId);
    if (!manifest) {
      throw new NotFoundException(`Plugin not found: ${pluginId}`);
    }
    const tenant = requireTenantContext();

    return this.repo.manager.transaction(async (manager) => {
      const transactionalRepo = manager.getRepository(InstalledPluginEntity);
      const installed = await transactionalRepo.findOne({
        where: { tenantId: tenant.tenantId, pluginId },
      });
      if (!installed) {
        throw new NotFoundException(`Plugin not installed: ${pluginId}`);
      }

      const comparison = this.compareVersions(manifest.version, installed.version);
      if (comparison < 0) {
        throw new ConflictException(
          `Plugin downgrade is not supported: ${installed.version} to ${manifest.version}`,
        );
      }
      if (comparison === 0) return installed;

      await this.assertPluginDependencies(manifest, transactionalRepo, tenant.tenantId);
      const context = await this.contextFactory.create(pluginId, installed.settings, undefined, {
        manager,
        capabilityState: { installed: true, enabled: installed.enabled },
      });
      const mod = this.getLifecycle(await this.loader.getModule(pluginId));
      await this.runVersionedMigrations(manifest, context, installed.version, manifest.version);
      if (mod?.onUpgrade) {
        await mod.onUpgrade(installed.version, manifest.version, context);
      }

      installed.version = manifest.version;
      return transactionalRepo.save(installed);
    });
  }

  async uninstall(pluginId: string): Promise<void> {
    const tenant = requireTenantContext();

    await this.repo.manager.transaction(async (manager) => {
      await manager.query("SELECT set_config('search_path', quote_ident($1) || ', public', true)", [tenant.schemaName]);
      const transactionalRepo = manager.getRepository(InstalledPluginEntity);
      const installed = await transactionalRepo.findOne({
        where: { tenantId: tenant.tenantId, pluginId },
      });
      if (!installed) {
        throw new NotFoundException(`Plugin not installed: ${pluginId}`);
      }

      const context = await this.contextFactory.create(pluginId, installed.settings, undefined, {
        manager,
        capabilityState: { installed: true, enabled: installed.enabled },
      });
      const mod = this.getLifecycle(await this.loader.getModule(pluginId));
      if (mod?.onUninstall) {
        await mod.onUninstall(context);
      }

      await manager.query('DELETE FROM custom_field_definitions WHERE plugin_id = $1', [pluginId]);
      this.logger.log(`Cleaned up custom fields for plugin: ${pluginId}`);

      const result = await transactionalRepo.delete({
        tenantId: tenant.tenantId,
        pluginId,
      });
      if (result.affected === 0) {
        throw new NotFoundException(`Plugin not installed: ${pluginId}`);
      }
    });
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

    const schema = this.loader.getManifest(pluginId)?.settings?.schema;
    if (schema) {
      const candidate = this.mergeSettingsWithDefaults(pluginId, {
        ...plugin.settings,
        ...settings,
      });
      const errors = this.validateSettings(schema, candidate, settings);
      if (Object.keys(errors).length > 0) {
        throw new BadRequestException({ message: 'Invalid plugin settings', errors });
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
      if (clearsOptionalValue || matchesDefault) delete storedSettings[key];
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
    const tenant = requireTenantContext();
    return this.repo.manager.transaction(async (manager) => {
      const transactionalRepo = manager.getRepository(InstalledPluginEntity);
      const plugin = await transactionalRepo.findOne({
        where: { tenantId: tenant.tenantId, pluginId },
      });
      if (!plugin) {
        throw new NotFoundException(`Plugin not installed: ${pluginId}`);
      }

      const context = await this.contextFactory.create(pluginId, plugin.settings, undefined, {
        manager,
        capabilityState: { installed: true, enabled },
      });
      const mod = this.getLifecycle(await this.loader.getModule(pluginId));
      if (enabled && mod?.onEnable) {
        await mod.onEnable(context);
      } else if (!enabled && mod?.onDisable) {
        await mod.onDisable(context);
      }

      plugin.enabled = enabled;
      return transactionalRepo.save(plugin);
    });
  }

  private async runInstallLifecycle(
    manifest: PluginManifest,
    mod: WeaverPlugin | undefined,
    context: Awaited<ReturnType<PluginContextFactory['create']>>,
  ): Promise<void> {
    await this.runVersionedMigrations(manifest, context, undefined, manifest.version);

    const legacyMigrations =
      manifest.migrations?.filter(
        (migration): migration is string => typeof migration === 'string',
      ) ?? [];
    if (!mod?.onInstall) {
      await this.runMigrationFiles(manifest.id, legacyMigrations, context);
    }
    if (mod?.onInstall) {
      await mod.onInstall(context);
    }
  }

  private async runVersionedMigrations(
    manifest: PluginManifest,
    context: Awaited<ReturnType<PluginContextFactory['create']>>,
    fromVersion: string | undefined,
    toVersion: string,
  ): Promise<void> {
    const migrations =
      manifest.migrations
        ?.filter((migration): migration is PluginMigration => typeof migration !== 'string')
        .filter(
          (migration) =>
            (!fromVersion || this.compareVersions(migration.version, fromVersion) > 0) &&
            this.compareVersions(migration.version, toVersion) <= 0,
        )
        .sort((left, right) => this.compareVersions(left.version, right.version)) ?? [];

    await this.runMigrationFiles(
      manifest.id,
      migrations.map((migration) => migration.path ?? migration.sql).filter(Boolean) as string[],
      context,
    );
  }

  private async runMigrationFiles(
    pluginId: string,
    migrationFiles: string[],
    context: Awaited<ReturnType<PluginContextFactory['create']>>,
  ): Promise<void> {
    if (migrationFiles.length === 0) return;
    const pluginDir = this.loader.getPluginDir(pluginId);
    if (!pluginDir) {
      throw new Error(`Plugin directory not found: ${pluginId}`);
    }
    const resolvedPluginDir = path.resolve(pluginDir);

    for (const migrationFile of migrationFiles) {
      const migrationPath = path.resolve(resolvedPluginDir, migrationFile);
      if (!migrationPath.startsWith(`${resolvedPluginDir}${path.sep}`)) {
        throw new Error(`Migration path escapes plugin directory: ${migrationFile}`);
      }
      if (!fs.existsSync(migrationPath)) {
        throw new Error(`Plugin migration not found: ${migrationFile}`);
      }
      await context.db.runMigration(fs.readFileSync(migrationPath, 'utf-8'));
      this.logger.log(`Ran migration: ${migrationFile} for ${pluginId}`);
    }
  }

  private async assertPluginDependencies(
    manifest: PluginManifest,
    repository: Repository<InstalledPluginEntity>,
    tenantId: string,
  ): Promise<void> {
    for (const dependency of manifest.requires?.plugins ?? []) {
      const installed = await repository.findOne({
        where: { tenantId, pluginId: dependency.id },
      });
      if (!installed) {
        throw new ConflictException(`Required plugin is not installed: ${dependency.id}`);
      }
      if (
        dependency.minimumVersion &&
        this.compareVersions(installed.version, dependency.minimumVersion) < 0
      ) {
        throw new ConflictException(
          `Required plugin ${dependency.id} must be at least ${dependency.minimumVersion}`,
        );
      }
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
      if (leftNumber !== null && rightNumber !== null) return Math.sign(leftNumber - rightNumber);
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
    if (!match) throw new Error(`Invalid semantic version: ${version}`);
    return {
      core: [Number(match[1]), Number(match[2]), Number(match[3])],
      prerelease: match[4]?.split('.') ?? [],
    };
  }

  private getLifecycle(mod: unknown): WeaverPlugin | undefined {
    if (!mod || (typeof mod !== 'object' && typeof mod !== 'function')) return undefined;
    const pluginModule = mod as { plugin?: WeaverPlugin; default?: WeaverPlugin };
    return pluginModule.plugin ?? pluginModule.default ?? (mod as WeaverPlugin);
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
      if (!schema[key]) errors[key] = 'Unknown setting';
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

  private recordUpgrade(
    pluginId: string,
    fromVersion: string,
    toVersion: string,
    success: boolean,
    error: string | null,
  ): void {
    const entry = {
      pluginId,
      fromVersion,
      toVersion,
      success,
      error,
      timestamp: new Date().toISOString(),
    };
    this.upgradeLog.push(entry);
    const message = `Plugin upgrade ${success ? 'succeeded' : 'failed'}: ${JSON.stringify(entry)}`;
    if (success) this.logger.log(message);
    else this.logger.error(message);
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
