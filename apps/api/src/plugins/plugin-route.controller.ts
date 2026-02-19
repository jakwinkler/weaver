import {
  Controller,
  All,
  Param,
  Req,
  Res,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../core/auth';
import type { PluginRouteDefinition } from '@weaver/sdk';
import { PluginRegistryService } from './plugin-registry.service';
import { PluginLoaderService } from './plugin-loader.service';
import { PluginContextFactory } from './plugin-context.factory';

@Controller('plugins')
@UseGuards(JwtAuthGuard)
export class PluginRouteController {
  constructor(
    private readonly registry: PluginRegistryService,
    private readonly loader: PluginLoaderService,
    private readonly contextFactory: PluginContextFactory,
  ) {}

  @All(':pluginId/*path')
  async handlePluginRoute(
    @Param('pluginId') pluginId: string,
    @Param('path') routePath: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    try {
      const installed = await this.registry.findInstalled(pluginId);
      if (!installed.enabled) {
        return res
          .status(HttpStatus.SERVICE_UNAVAILABLE)
          .json({ message: 'Plugin is disabled' });
      }

      const manifest = this.loader.getManifest(pluginId);
      if (!manifest) {
        return res
          .status(HttpStatus.NOT_FOUND)
          .json({ message: 'Plugin not found' });
      }

      // Find matching route in manifest
      const method = req.method.toUpperCase();
      const matchedRoute = manifest.routes?.find(
        (r: PluginRouteDefinition) =>
          r.method === method && this.matchPath(r.path, `/${routePath}`),
      );

      if (!matchedRoute) {
        return res
          .status(HttpStatus.NOT_FOUND)
          .json({ message: 'Plugin route not found' });
      }

      const reqUser = (req as any).user;
      const context = await this.contextFactory.create(
        pluginId,
        installed.settings,
        reqUser
          ? {
              id: reqUser.id,
              email: reqUser.email,
              displayName: reqUser.displayName || '',
            }
          : undefined,
      );

      // For now, return a placeholder. In a full implementation,
      // the route handler would be loaded from the plugin's server entrypoint.
      return res.status(HttpStatus.OK).json({
        message: `Plugin route handled: ${method} ${routePath}`,
        plugin: pluginId,
      });
    } catch (err: any) {
      if (err.status) {
        return res.status(err.status).json({ message: err.message });
      }
      return res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: 'Plugin route error' });
    }
  }

  private matchPath(pattern: string, actual: string): boolean {
    // Simple path matching - could be enhanced with path-to-regexp
    const patternParts = pattern.split('/').filter(Boolean);
    const actualParts = actual.split('/').filter(Boolean);
    if (patternParts.length !== actualParts.length) return false;
    return patternParts.every(
      (part, i) => part.startsWith(':') || part === actualParts[i],
    );
  }
}
