import {
  All,
  Controller,
  HttpStatus,
  Logger,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { PluginResponse, PluginRouteDefinition } from '@weaver/sdk';
import { RoleEntity } from '@weaver/db';
import { tenantStorage } from '../core/tenant/tenant.context';
import { TenantConnectionProvider } from '../core/tenant/tenant-connection.provider';
import { TenantService } from '../core/tenant/tenant.service';
import { ProjectAccessService } from '../core/tenant/project-access.service';
import type { RequestUser } from '../core/auth';
import { PluginRegistryService } from './plugin-registry.service';
import { PluginLoaderService } from './plugin-loader.service';
import { PluginContextFactory } from './plugin-context.factory';
import { PluginRouteAuthGuard } from './plugin-route-auth.guard';
import {
  matchPluginRoute,
  type MatchedPluginRoute,
} from './plugin-route.matcher';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller('plugin-routes')
@UseGuards(PluginRouteAuthGuard)
export class PluginRouteController {
  private readonly logger = new Logger(PluginRouteController.name);

  constructor(
    private readonly registry: PluginRegistryService,
    private readonly loader: PluginLoaderService,
    private readonly contextFactory: PluginContextFactory,
    private readonly tenantConnections: TenantConnectionProvider,
    private readonly tenantService: TenantService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  @All('*')
  async handlePluginRoute(@Req() req: Request, @Res() res: Response) {
    const match = matchPluginRoute(this.loader, req);
    if (!match) {
      return res
        .status(HttpStatus.NOT_FOUND)
        .json({ message: 'Plugin route not found' });
    }

    this.logger.debug(
      `Plugin route: ${req.method} pluginId=${match.pluginId} path=${match.normalizedPath}`,
    );

    if (!match.route.public) {
      return this.dispatch(req, res, match);
    }

    const tenantId = match.params.tenantId;
    if (!tenantId || !UUID_RE.test(tenantId)) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .json({ message: 'Public plugin routes require a valid tenantId' });
    }

    const tenant = await this.tenantService.findById(tenantId);
    if (!tenant) {
      return res.status(HttpStatus.NOT_FOUND).json({ message: 'Tenant not found' });
    }

    return tenantStorage.run(
      { tenantId: tenant.id, schemaName: tenant.schemaName },
      () => this.dispatch(req, res, match),
    );
  }

  private async dispatch(
    req: Request,
    res: Response,
    match: MatchedPluginRoute,
  ) {
    try {
      const installed = await this.registry.findInstalled(match.pluginId);
      if (!installed.enabled) {
        return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({ message: 'Plugin is disabled' });
      }

      const authenticatedUser = (req as Request & { user?: RequestUser }).user;
      if ((!match.route.public || match.route.requiredPermissions?.length) && !authenticatedUser?.role) {
        return res.status(HttpStatus.UNAUTHORIZED).json({ message: 'Authentication required' });
      }
      const permissionFailure = await this.checkPermissions(req, match.route);
      if (permissionFailure) {
        return res.status(HttpStatus.FORBIDDEN).json(permissionFailure);
      }

      if (!match.route.public) {
        const reqUser = (req as Request & { user?: RequestUser }).user;
        if (!reqUser) {
          return res
            .status(HttpStatus.UNAUTHORIZED)
            .json({ message: 'Authentication required' });
        }
        const mode = req.method === 'GET' ? 'read' : 'write';
        if (match.params.issueKey) {
          await this.projectAccess.assertIssueKey(match.params.issueKey, reqUser, mode);
        }
        if (match.params.projectKey) {
          await this.projectAccess.assertProjectKey(match.params.projectKey, reqUser, mode);
        }
      }

      const handler = await this.loader.getHandler(
        match.pluginId,
        match.route.handler,
      );
      if (!handler) {
        return res.status(HttpStatus.NOT_IMPLEMENTED).json({
          message: `Handler not found: ${match.route.handler}`,
        });
      }

      const reqUser = (req as Request & { user?: Record<string, string> }).user;
      const context = await this.contextFactory.create(
        match.pluginId,
        this.registry.mergeSettingsWithDefaults(match.pluginId, installed.settings),
        reqUser
          ? {
              id: reqUser.userId || reqUser.id,
              email: reqUser.email,
              displayName: reqUser.displayName || '',
            }
          : undefined,
      );
      const rawBody = (
        req as Request & { rawBody?: Buffer }
      ).rawBody?.toString('utf8');
      const pluginRequest = {
        params: match.params,
        query: (req.query || {}) as Record<string, string>,
        body: req.body,
        ...(rawBody === undefined ? {} : { rawBody }),
        headers: Object.fromEntries(Object.entries(req.headers).flatMap(([key, value]) => typeof value === 'string' ? [[key, value]] : [])),
        auth: { type: 'interactive' as const },
      };

      const result: PluginResponse = await handler(pluginRequest, context);
      if (result.headers) {
        for (const [key, value] of Object.entries(result.headers)) {
          res.setHeader(key, value);
        }
      }
      return typeof result.body === 'string'
        ? res.status(result.status).send(result.body)
        : res.status(result.status).json(result.body);
    } catch (error: any) {
      this.logger.error(`Plugin route error: ${error.message}`, error.stack);
      if (error.status) {
        return res.status(error.status).json({ message: error.message });
      }
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: 'Plugin route error' });
    }
  }

  private async checkPermissions(
    req: Request,
    route: PluginRouteDefinition,
  ): Promise<{ message: string; missing: string[] } | undefined> {
    if (!route.requiredPermissions?.length) return undefined;

    const reqUser = (req as Request & { user?: Record<string, string> }).user;
    if (!reqUser?.role) return { message: 'Authentication required', missing: route.requiredPermissions };
    if (reqUser.role === 'owner') return undefined;

    const em = await this.tenantConnections.getEntityManager();
    const role = await em.getRepository(RoleEntity).findOne({
      where: { name: reqUser?.role },
    });
    const permissions = (role?.permissions ?? {}) as Record<string, unknown>;
    if (permissions['*'] === true) return undefined;

    const missing = route.requiredPermissions.filter(
      (permission) => permissions[permission] !== true,
    );
    return missing.length > 0
      ? { message: 'Missing required permissions', missing }
      : undefined;
  }
}
