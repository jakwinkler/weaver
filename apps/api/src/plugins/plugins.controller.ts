import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../core/auth';
import { PluginRegistryService } from './plugin-registry.service';
import { PluginLoaderService } from './plugin-loader.service';

@Controller('plugins')
@UseGuards(JwtAuthGuard)
export class PluginsController {
  constructor(
    private readonly registry: PluginRegistryService,
    private readonly loader: PluginLoaderService,
  ) {}

  @Get('available')
  async listAvailable() {
    return this.loader.getAllManifests();
  }

  @Get('permissions')
  async getPluginPermissions() {
    const installed = await this.registry.getInstalled();
    const enabledIds = new Set(
      installed.filter((p) => p.enabled).map((p) => p.pluginId),
    );

    const manifests = this.loader.getAllManifests();
    const result: Record<string, { pluginName: string; permissions: Array<{ key: string; label: string; description?: string }> }> = {};

    for (const manifest of manifests) {
      if (enabledIds.has(manifest.id) && manifest.declaredPermissions && manifest.declaredPermissions.length > 0) {
        result[manifest.id] = {
          pluginName: manifest.name,
          permissions: manifest.declaredPermissions,
        };
      }
    }

    return result;
  }

  @Get()
  async listInstalled() {
    return this.registry.getInstalled();
  }

  @Post('install')
  async install(@Body('pluginId') pluginId: string) {
    return this.registry.install(pluginId);
  }

  @Post('uninstall')
  @HttpCode(HttpStatus.NO_CONTENT)
  async uninstall(@Body('pluginId') pluginId: string) {
    return this.registry.uninstall(pluginId);
  }

  @Post('enable')
  async enable(@Body('pluginId') pluginId: string) {
    return this.registry.enable(pluginId);
  }

  @Post('disable')
  async disable(@Body('pluginId') pluginId: string) {
    return this.registry.disable(pluginId);
  }

  @Post('upgrade')
  async upgrade(@Body('pluginId') pluginId: string) {
    return this.registry.upgrade(pluginId);
  }

  @Patch('settings')
  async updateSettings(
    @Body('pluginId') pluginId: string,
    @Body('settings') settings: Record<string, unknown>,
  ) {
    return this.registry.updateSettings(pluginId, settings);
  }
}
