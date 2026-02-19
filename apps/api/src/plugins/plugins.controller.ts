import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
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

  @Get()
  async listInstalled() {
    return this.registry.getInstalled();
  }

  @Post(':pluginId/install')
  async install(@Param('pluginId') pluginId: string) {
    return this.registry.install(pluginId);
  }

  @Delete(':pluginId/uninstall')
  @HttpCode(HttpStatus.NO_CONTENT)
  async uninstall(@Param('pluginId') pluginId: string) {
    return this.registry.uninstall(pluginId);
  }

  @Post(':pluginId/enable')
  async enable(@Param('pluginId') pluginId: string) {
    return this.registry.enable(pluginId);
  }

  @Post(':pluginId/disable')
  async disable(@Param('pluginId') pluginId: string) {
    return this.registry.disable(pluginId);
  }

  @Patch(':pluginId/settings')
  async updateSettings(
    @Param('pluginId') pluginId: string,
    @Body() settings: Record<string, unknown>,
  ) {
    return this.registry.updateSettings(pluginId, settings);
  }
}
