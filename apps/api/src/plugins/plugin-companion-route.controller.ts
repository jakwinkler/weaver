import { All, Controller, HttpStatus, Logger, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { PluginRequest, PluginResponse, PluginRouteDefinition } from '@weaver/sdk';
import { RateLimit } from '../core/rate-limiting';
import { PluginContextFactory } from './plugin-context.factory';
import { PluginLoaderService } from './plugin-loader.service';
import { PluginRegistryService } from './plugin-registry.service';
import { TenantService } from '../core/tenant/tenant.service';
import { tenantStorage } from '../core/tenant/tenant.context';
import { InjectRepository } from '@nestjs/typeorm';
import { TenantMembershipEntity } from '@weaver/db';
import { Repository } from 'typeorm';

interface DevicePrincipal {
  deviceId: string;
  userId: string;
  scopes: string[];
}

@Controller('plugin-companion-routes')
@RateLimit(60, 60_000)
export class PluginCompanionRouteController {
  private readonly logger = new Logger(PluginCompanionRouteController.name);

  constructor(
    private readonly registry: PluginRegistryService,
    private readonly loader: PluginLoaderService,
    private readonly contextFactory: PluginContextFactory,
    private readonly tenants: TenantService,
    @InjectRepository(TenantMembershipEntity)
    private readonly memberships: Repository<TenantMembershipEntity>,
  ) {}

  @All('*')
  async handleCompanionRoute(@Req() req: Request, @Res() res: Response) {
    // The header locates the credential store. Only the pairing secret or device
    // authenticator below grants access, never the header or a browser session.
    const tenantId = req.headers['x-tenant-id'];
    if (typeof tenantId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
      return res.status(HttpStatus.BAD_REQUEST).json({ message: 'A valid tenant ID is required' });
    }
    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) return res.status(HttpStatus.NOT_FOUND).json({ message: 'Tenant not found' });
    return tenantStorage.run({ tenantId, schemaName: tenant.schemaName }, () => this.dispatchCompanionRoute(req, res, tenantId));
  }

  private async dispatchCompanionRoute(req: Request, res: Response, tenantId: string) {
    const parsed = this.parseRoute(req.path);
    if (!parsed) {
      return res.status(HttpStatus.NOT_FOUND).json({ message: 'Missing route path' });
    }

    try {
      const installed = await this.registry.findInstalled(parsed.pluginId);
      if (!installed.enabled) {
        return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({ message: 'Plugin is disabled' });
      }

      const manifest = this.loader.getManifest(parsed.pluginId);
      if (!manifest) {
        return res.status(HttpStatus.NOT_FOUND).json({ message: 'Plugin manifest not found' });
      }

      const normalizedPath = `/${parsed.routePath}`;
      const matchedRoute = manifest.routes?.find(
        (route: PluginRouteDefinition) =>
          route.auth !== undefined &&
          route.auth !== 'interactive' &&
          route.method === req.method.toUpperCase() &&
          this.matchPath(route.path, normalizedPath),
      );
      if (!matchedRoute) {
        return res
          .status(HttpStatus.NOT_FOUND)
          .json({ message: 'Plugin companion route not found' });
      }

      const handler = await this.loader.getHandler(parsed.pluginId, matchedRoute.handler);
      if (!handler) {
        return res.status(HttpStatus.NOT_IMPLEMENTED).json({ message: 'Plugin handler not found' });
      }

      const pluginRequest: PluginRequest = {
        params: this.extractParams(matchedRoute.path, normalizedPath),
        query: (req.query || {}) as Record<string, string>,
        body: req.body,
        headers: req.headers as Record<string, string>,
        auth: { type: 'pairing' },
      };
      let context = await this.contextFactory.create(parsed.pluginId, installed.settings);

      if (matchedRoute.auth === 'device') {
        const authenticatorName = manifest.companion?.authenticator;
        if (!authenticatorName) {
          return res
            .status(HttpStatus.NOT_IMPLEMENTED)
            .json({ message: 'Device authentication is not configured' });
        }
        const authenticator = await this.loader.getHandler(parsed.pluginId, authenticatorName);
        if (!authenticator) {
          return res
            .status(HttpStatus.NOT_IMPLEMENTED)
            .json({ message: 'Device authenticator not found' });
        }
        const authentication = (await authenticator(pluginRequest, context)) as PluginResponse;
        if (authentication.status !== HttpStatus.OK) {
          return this.send(res, authentication);
        }
        const principal = this.devicePrincipal(authentication.body);
        if (!principal) {
          this.logger.error(`Invalid device principal returned by ${parsed.pluginId}`);
          return res
            .status(HttpStatus.INTERNAL_SERVER_ERROR)
            .json({ message: 'Invalid device principal' });
        }
        const missing = (matchedRoute.requiredDeviceScopes ?? []).filter(
          (scope) => !principal.scopes.includes(scope),
        );
        if (missing.length > 0) {
          return res.status(HttpStatus.FORBIDDEN).json({
            message: 'Missing required device scopes',
            missing,
          });
        }
        if (!await this.memberships.findOneBy({ tenantId, userId: principal.userId })) {
          return res.status(HttpStatus.UNAUTHORIZED).json({ message: 'Device membership is no longer valid' });
        }
        pluginRequest.auth = {
          type: 'device',
          deviceId: principal.deviceId,
          scopes: principal.scopes,
        };
        context = await this.contextFactory.create(parsed.pluginId, installed.settings, {
          id: principal.userId,
          email: '',
          displayName: '',
        });
      }

      const result = (await handler(pluginRequest, context)) as PluginResponse;
      return this.send(res, result);
    } catch (error: any) {
      this.logger.error(`Plugin companion route error: ${error.message}`, error.stack);
      if (error.status) {
        return res.status(error.status).json({ message: error.message });
      }
      return res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: 'Plugin companion route error' });
    }
  }

  private send(res: Response, result: PluginResponse) {
    for (const [key, value] of Object.entries(result.headers ?? {})) {
      res.setHeader(key, value);
    }
    return res.status(result.status).json(result.body);
  }

  private parseRoute(path: string): { pluginId: string; routePath: string } | null {
    const stripped = path.replace(/^.*\/plugin-companion-routes\//, '');
    const firstSlash = stripped.indexOf('/');
    if (firstSlash === -1) return null;
    return {
      pluginId: decodeURIComponent(stripped.substring(0, firstSlash)).replace('~', '/'),
      routePath: stripped.substring(firstSlash + 1),
    };
  }

  private matchPath(pattern: string, actual: string): boolean {
    const patternParts = pattern.split('/').filter(Boolean);
    const actualParts = actual.split('/').filter(Boolean);
    return (
      patternParts.length === actualParts.length &&
      patternParts.every((part, index) => part.startsWith(':') || part === actualParts[index])
    );
  }

  private extractParams(pattern: string, actual: string): Record<string, string> {
    const patternParts = pattern.split('/').filter(Boolean);
    const actualParts = actual.split('/').filter(Boolean);
    return Object.fromEntries(
      patternParts
        .map((part, index) => (part.startsWith(':') ? [part.slice(1), actualParts[index]] : null))
        .filter((entry): entry is [string, string] => entry !== null),
    );
  }

  private devicePrincipal(value: unknown): DevicePrincipal | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const principal = value as Record<string, unknown>;
    if (
      typeof principal.deviceId !== 'string' ||
      typeof principal.userId !== 'string' ||
      !Array.isArray(principal.scopes) ||
      !principal.scopes.every((scope) => typeof scope === 'string')
    ) {
      return null;
    }
    return principal as unknown as DevicePrincipal;
  }
}
