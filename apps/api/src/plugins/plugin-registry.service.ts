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
import { requireTenantContext } from '../core/tenant';

@Injectable()
export class PluginRegistryService {
  private readonly logger = new Logger(PluginRegistryService.name);

  constructor(
    @InjectRepository(InstalledPluginEntity)
    private readonly repo: Repository<InstalledPluginEntity>,
    private readonly loader: PluginLoaderService,
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
    return this.repo.save(plugin);
  }

  async uninstall(pluginId: string): Promise<void> {
    const tenant = requireTenantContext();
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
    return this.repo.save(plugin);
  }
}
