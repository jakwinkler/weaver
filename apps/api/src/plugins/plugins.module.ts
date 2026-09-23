import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InstalledPluginEntity } from '@weaver/db';
import { TenantModule } from '../core/tenant';
import { EventsModule } from '../modules/events';
import { PluginLoaderService } from './plugin-loader.service';
import { PluginRegistryService } from './plugin-registry.service';
import { PluginContextFactory } from './plugin-context.factory';
import { PluginEventBridgeService } from './plugin-event-bridge.service';
import { PluginsController } from './plugins.controller';
import { PluginRouteController } from './plugin-route.controller';
import { PluginAssetsController } from './plugin-assets.controller';
import { PluginCompanionRouteController } from './plugin-companion-route.controller';
import { TimeTrackingModule } from '../modules/time-tracking';
import { PluginRouteAuthGuard } from './plugin-route-auth.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([InstalledPluginEntity]),
    TenantModule,
    EventsModule,
    TimeTrackingModule,
  ],
  controllers: [
    PluginsController,
    PluginRouteController,
    PluginAssetsController,
    PluginCompanionRouteController,
  ],
  providers: [
    PluginLoaderService,
    PluginRegistryService,
    PluginContextFactory,
    PluginEventBridgeService,
    PluginRouteAuthGuard,
  ],
  exports: [PluginLoaderService, PluginRegistryService, PluginContextFactory],
})
export class PluginsModule {}
