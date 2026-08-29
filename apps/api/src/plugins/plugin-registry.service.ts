import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InstalledPluginEntity } from '@weaver/db';
import type { PluginManifest, PluginMigrationDefinition, WeaverPlugin } from '@weaver/sdk';
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
    return this.repo.manager.transaction(async (manager) => {
      const transactionalRepo = manager.getRepository(InstalledPluginEntity);
      const existing = await transactionalRepo.findOne({
        where: { tenantId: tenant.tenantId, pluginId },
      });
      if (existing) {
        throw new ConflictException(`Plugin already installed: ${pluginId}`);
      }

      await this.assertPluginDependencies(manifest, transactionalRepo, tenant.tenantId);
      const context = await this.contextFactory.create(pluginId, {}, undefined, {
        manager,
        capabilityState: { installed: false, enabled: false },
      });
      const mod = await this.loader.getModule(pluginId);
      await this.runInstallLifecycle(manifest, mod, context);

      const plugin = transactionalRepo.create({
        tenantId: tenant.tenantId,
        pluginId: manifest.id,
        version: manifest.version,
        enabled: true,
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
      const mod = (await this.loader.getModule(pluginId)) as WeaverPlugin | undefined;
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
      const mod = await this.loader.getModule(pluginId);
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
        ?.filter(
          (migration): migration is PluginMigrationDefinition => typeof migration !== 'string',
        )
        .filter(
          (migration) =>
            (!fromVersion || this.compareVersions(migration.version, fromVersion) > 0) &&
            this.compareVersions(migration.version, toVersion) <= 0,
        )
        .sort((left, right) => this.compareVersions(left.version, right.version)) ?? [];

    await this.runMigrationFiles(
      manifest.id,
      migrations.map((migration) => migration.path),
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
    const leftParts = left.split('-', 1)[0].split('.').map(Number);
    const rightParts = right.split('-', 1)[0].split('.').map(Number);
    for (let index = 0; index < 3; index += 1) {
      if (leftParts[index] !== rightParts[index]) {
        return leftParts[index] - rightParts[index];
      }
    }
    return left.localeCompare(right);
  }
}
