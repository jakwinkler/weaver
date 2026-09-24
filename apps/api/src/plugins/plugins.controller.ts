import { redactSettingsSecrets } from '../core/security/settings-secrets';
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import {
  JwtAuthGuard,
  PermissionGuard,
  RequirePermission,
} from '../core/auth';
import { PluginRegistryService } from './plugin-registry.service';
import { PluginLoaderService } from './plugin-loader.service';
import { Audit } from '../modules/audit';

@Controller('plugins')
@UseGuards(JwtAuthGuard)
export class PluginsController {
  constructor(
    private readonly registry: PluginRegistryService,
    private readonly loader: PluginLoaderService,
  ) {}

  @Get('available')
  async listAvailable() {
    return this.loader.getAllClientManifests();
  }

  @Get('permissions')
  async getPluginPermissions() {
    const installed = await this.registry.getInstalled();
    const enabledIds = new Set(installed.filter((p) => p.enabled).map((p) => p.pluginId));

    const manifests = this.loader.getAllManifests();
    const result: Record<
      string,
      {
        pluginName: string;
        permissions: Array<{ key: string; label: string; description?: string }>;
      }
    > = {};

    for (const manifest of manifests) {
      if (
        enabledIds.has(manifest.id) &&
        manifest.declaredPermissions &&
        manifest.declaredPermissions.length > 0
      ) {
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
    const installed = await this.registry.getInstalled();
    return installed.map(({ id, pluginId, version, enabled, installedAt }) => ({
      id,
      pluginId,
      version,
      enabled,
      installedAt,
    }));
  }

  @Post('install')
  @Audit({
    action: 'plugin.installed',
    resource: 'plugin',
    resourceId: ({ request }) => request.body.pluginId,
  })
  @UseGuards(PermissionGuard)
  @RequirePermission('admin', 'manage_plugins')
  async install(@Body('pluginId') pluginId: string) {
    return redactSettingsSecrets(await this.registry.install(pluginId));
  }

  @Post('uninstall')
  @UseGuards(PermissionGuard)
  @RequirePermission('admin', 'manage_plugins')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({
    action: 'plugin.uninstalled',
    resource: 'plugin',
    captureBefore: true,
    resourceId: ({ request }) => request.body.pluginId,
  })
  async uninstall(
    @Body('pluginId') pluginId: string,
    @Body('confirmDataDeletion') confirmDataDeletion?: boolean,
  ) {
    const manifest = this.loader.getManifest(pluginId);
    if (manifest?.uninstall?.deletesPrivateData && confirmDataDeletion !== true) {
      throw new BadRequestException(
        manifest.uninstall.confirmationMessage ??
          `Uninstalling ${manifest.name} deletes its private plugin data and requires confirmation`,
      );
    }
    return this.registry.uninstall(pluginId);
  }

  @Post('enable')
  @Audit({
    action: 'plugin.enabled',
    resource: 'plugin',
    captureBefore: true,
    resourceId: ({ request }) => request.body.pluginId,
  })
  @UseGuards(PermissionGuard)
  @RequirePermission('admin', 'manage_plugins')
  async enable(@Body('pluginId') pluginId: string) {
    return redactSettingsSecrets(await this.registry.enable(pluginId));
  }

  @Post('disable')
  @Audit({
    action: 'plugin.disabled',
    resource: 'plugin',
    captureBefore: true,
    resourceId: ({ request }) => request.body.pluginId,
  })
  @UseGuards(PermissionGuard)
  @RequirePermission('admin', 'manage_plugins')
  async disable(@Body('pluginId') pluginId: string) {
    return redactSettingsSecrets(await this.registry.disable(pluginId));
  }

  @Post('upgrade')
  @UseGuards(PermissionGuard)
  @RequirePermission('admin', 'manage_plugins')
  @Audit({
    action: 'plugin.upgraded',
    resource: 'plugin',
    captureBefore: true,
    resourceId: ({ request }) => request.body.pluginId,
  })
  async upgrade(@Body('pluginId') pluginId: string) {
    return redactSettingsSecrets(await this.registry.upgrade(pluginId));
  }

  @Patch('settings')
  @Audit({
    action: 'plugin.settings_updated',
    resource: 'plugin',
    captureBefore: true,
    resourceId: ({ request }) => request.body.pluginId,
  })
  @UseGuards(PermissionGuard)
  @RequirePermission('admin', 'manage_plugins')
  async updateSettings(
    @Body('pluginId') pluginId: string,
    @Body('settings') settings: Record<string, unknown>,
  ) {
    return redactSettingsSecrets(await this.registry.updateSettings(pluginId, settings));
  }

  @Get('settings')
  @UseGuards(PermissionGuard)
  @RequirePermission('admin', 'manage_plugins')
  async getSettings(@Query('pluginId') pluginId: string) {
    return redactSettingsSecrets(await this.registry.getSettings(pluginId));
  }
}
