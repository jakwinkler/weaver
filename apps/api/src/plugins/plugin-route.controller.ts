import {
  Controller,
  All,
  Param,
  Req,
  Res,
  HttpStatus,
  UseGuards,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../core/auth';
import type { PluginRouteDefinition, PluginResponse } from '@weaver/sdk';
import { RoleEntity } from '@weaver/db';
import { TenantConnectionProvider } from '../core/tenant/tenant-connection.provider';
import { PluginRegistryService } from './plugin-registry.service';
import { PluginLoaderService } from './plugin-loader.service';
import { PluginContextFactory } from './plugin-context.factory';

@Controller('plugin-routes')
@UseGuards(JwtAuthGuard)
export class PluginRouteController {
  private readonly logger = new Logger(PluginRouteController.name);

  constructor(
    private readonly registry: PluginRegistryService,
    private readonly loader: PluginLoaderService,
    private readonly contextFactory: PluginContextFactory,
    private readonly tenantConnections: TenantConnectionProvider,
  ) {}

  @All('*')
  async handlePluginRoute(
    @Req() req: Request,
    @Res() res: Response,
  ) {
    // Parse pluginId and sub-path from the raw URL.
    // Scoped IDs like @weaver/plugin-checklist use ~ for the slash:
    //   /plugin-routes/@weaver~plugin-checklist/issues/QM-2/checklist
    // We strip the controller prefix and split on the first / after the pluginId.
    const stripped = req.path.replace(/^.*\/plugin-routes\//, '');
    const firstSlash = stripped.indexOf('/');
    if (firstSlash === -1) {
      return res.status(HttpStatus.NOT_FOUND).json({ message: 'Missing route path' });
    }
    const rawPluginId = decodeURIComponent(stripped.substring(0, firstSlash));
    const routePath = stripped.substring(firstSlash + 1);
    const pluginId = rawPluginId.replace('~', '/');

    this.logger.debug(`Plugin route: ${req.method} pluginId=${pluginId} path=/${routePath}`);

    try {
      const installed = await this.registry.findInstalled(pluginId);
      if (!installed.enabled) {
        return res
          .status(HttpStatus.SERVICE_UNAVAILABLE)
          .json({ message: 'Plugin is disabled' });
      }

      const manifest = this.loader.getManifest(pluginId);
      if (!manifest) {
        this.logger.warn(`Plugin manifest not found: ${pluginId}`);
        return res
          .status(HttpStatus.NOT_FOUND)
          .json({ message: `Plugin manifest not found: ${pluginId}` });
      }

      // Find matching route in manifest
      const method = req.method.toUpperCase();
      const normalizedPath = `/${routePath}`;
      const matchedRoute = manifest.routes?.find(
        (r: PluginRouteDefinition) =>
          r.method === method && this.matchPath(r.path, normalizedPath),
      );

      if (!matchedRoute) {
        this.logger.warn(
          `No matching route for ${method} ${normalizedPath} in plugin ${pluginId}. ` +
          `Available: ${manifest.routes?.map((r) => `${r.method} ${r.path}`).join(', ')}`,
        );
        return res
          .status(HttpStatus.NOT_FOUND)
          .json({ message: `Plugin route not found: ${method} ${normalizedPath}` });
      }

      // Check route-level permissions
      if (matchedRoute.requiredPermissions?.length) {
        const reqUser = (req as any).user;
        if (reqUser?.role !== 'owner') {
          const em = await this.tenantConnections.getEntityManager();
          const role = await em.getRepository(RoleEntity).findOne({
            where: { name: reqUser?.role },
          });
          const perms = (role?.permissions ?? {}) as Record<string, unknown>;
          if (perms['*'] !== true) {
            const missing = matchedRoute.requiredPermissions.filter(
              (p) => perms[p] !== true,
            );
            if (missing.length > 0) {
              return res.status(HttpStatus.FORBIDDEN).json({
                message: 'Missing required permissions',
                missing,
              });
            }
          }
        }
      }

      // Load the handler
      const handler = await this.loader.getHandler(pluginId, matchedRoute.handler);
      if (!handler) {
        return res
          .status(HttpStatus.NOT_IMPLEMENTED)
          .json({ message: `Handler not found: ${matchedRoute.handler}` });
      }

      const reqUser = (req as any).user;
      const context = await this.contextFactory.create(
        pluginId,
        installed.settings,
        reqUser
          ? {
              id: reqUser.userId || reqUser.id,
              email: reqUser.email,
              displayName: reqUser.displayName || '',
            }
          : undefined,
      );

      // Build PluginRequest
      const params = this.extractParams(matchedRoute.path, normalizedPath);
      const pluginRequest = {
        params,
        query: (req.query || {}) as Record<string, string>,
        body: req.body,
        headers: req.headers as Record<string, string>,
      };

      // Call handler
      const result: PluginResponse = await handler(pluginRequest, context);

      // Return PluginResponse
      if (result.headers) {
        for (const [key, value] of Object.entries(result.headers)) {
          res.setHeader(key, value);
        }
      }
      return res.status(result.status).json(result.body);
    } catch (err: any) {
      this.logger.error(`Plugin route error: ${err.message}`, err.stack);
      if (err.status) {
        return res.status(err.status).json({ message: err.message });
      }
      return res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: 'Plugin route error' });
    }
  }

  private matchPath(pattern: string, actual: string): boolean {
    const patternParts = pattern.split('/').filter(Boolean);
    const actualParts = actual.split('/').filter(Boolean);
    if (patternParts.length !== actualParts.length) return false;
    return patternParts.every(
      (part, i) => part.startsWith(':') || part === actualParts[i],
    );
  }

  private extractParams(pattern: string, actual: string): Record<string, string> {
    const patternParts = pattern.split('/').filter(Boolean);
    const actualParts = actual.split('/').filter(Boolean);
    const params: Record<string, string> = {};

    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(':')) {
        params[patternParts[i].slice(1)] = actualParts[i];
      }
    }

    return params;
  }
}
