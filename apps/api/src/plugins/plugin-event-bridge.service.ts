import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InstalledPluginEntity } from '@weaver/db';
import { EventDispatcherService } from '../modules/events';
import { PluginRegistryService } from './plugin-registry.service';
import { PluginLoaderService } from './plugin-loader.service';
import { PluginContextFactory } from './plugin-context.factory';
import { requireTenantContext } from '../core/tenant';

@Injectable()
export class PluginEventBridgeService implements OnModuleInit {
  private readonly logger = new Logger(PluginEventBridgeService.name);

  constructor(
    @InjectRepository(InstalledPluginEntity)
    private readonly repo: Repository<InstalledPluginEntity>,
    private readonly eventDispatcher: EventDispatcherService,
    private readonly loader: PluginLoaderService,
    private readonly contextFactory: PluginContextFactory,
    private readonly registry: PluginRegistryService,
  ) {}

  onModuleInit(): void {
    this.eventDispatcher.registerPluginDispatcher(
      async (event: string, payload: Record<string, unknown>) => {
        await this.dispatchToPlugins(event, payload);
      },
    );
    this.logger.log('Plugin event bridge registered');
  }

  private async dispatchToPlugins(
    event: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    let tenant: { tenantId: string; schemaName: string };
    try {
      tenant = requireTenantContext();
    } catch {
      // No tenant context (e.g. system-level event), skip plugin dispatch
      return;
    }

    const installed = await this.repo.find({
      where: { tenantId: tenant.tenantId, enabled: true },
    });

    for (const plugin of installed) {
      const manifest = this.loader.getManifest(plugin.pluginId);
      if (!manifest) continue;

      const subscribes = manifest.events?.subscribes || [];
      if (!subscribes.includes(event) && !subscribes.includes('*')) continue;

      try {
        const mod = await this.loader.getModule(plugin.pluginId);
        if (!mod?.onEvent) continue;

        const context = await this.contextFactory.create(
          plugin.pluginId,
          this.registry.mergeSettingsWithDefaults(plugin.pluginId, plugin.settings),
        );
        await mod.onEvent(event, payload, context);
      } catch (err) {
        this.logger.warn(
          `Plugin ${plugin.pluginId} failed handling event ${event}: ${err}`,
        );
      }
    }
  }
}
