import { createHash } from 'crypto';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { Repository } from 'typeorm';
import { ApiKeyEntity, TenantMembershipEntity } from '@weaver/db';
import { API_KEY_PREFIX, type ApiKeyScope } from '@weaver/shared';
import { getTenantContext, tenantStorage } from '../tenant';
import type { RequestUser } from './current-user.decorator';
import { PERMISSION_KEY, type RequiredPermission } from './require-permission.decorator';
import { ApiKeyRateLimitGuard } from './api-key-rate-limit.guard';

const LAST_USED_DEBOUNCE_MS = 5 * 60_000;

type ApiKeyRequest = Request & { user?: RequestUser };

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    @InjectRepository(ApiKeyEntity)
    private readonly apiKeyRepo: Repository<ApiKeyEntity>,
    @InjectRepository(TenantMembershipEntity)
    private readonly membershipRepo: Repository<TenantMembershipEntity>,
    private readonly reflector: Reflector,
    private readonly rateLimitGuard: ApiKeyRateLimitGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ApiKeyRequest>();
    const plainKey = this.extractApiKey(request);

    if (!plainKey) {
      throw new UnauthorizedException('Invalid API key');
    }

    const apiKey = await this.apiKeyRepo.findOne({
      where: { keyHash: this.hash(plainKey) },
      relations: { user: true, tenant: true },
    });

    if (!apiKey || !apiKey.user || !apiKey.tenant) {
      throw new UnauthorizedException('Invalid API key');
    }

    if (apiKey.expiresAt && apiKey.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('API key has expired');
    }

    const membership = await this.membershipRepo.findOneBy({
      tenantId: apiKey.tenantId,
      userId: apiKey.userId,
    });
    if (!membership) {
      throw new UnauthorizedException('API key membership is no longer valid');
    }

    const currentTenant = getTenantContext();
    if (currentTenant && currentTenant.tenantId !== apiKey.tenantId) {
      throw new UnauthorizedException('API key is not valid for this tenant');
    }
    if (!currentTenant) {
      tenantStorage.enterWith({
        tenantId: apiKey.tenantId,
        schemaName: apiKey.tenant.schemaName,
      });
    }

    const scopes = apiKey.scopes as ApiKeyScope[];
    request.user = {
      userId: apiKey.user.id,
      email: apiKey.user.email,
      tenantId: apiKey.tenantId,
      role: membership.role,
      authMethod: 'apiKey',
      apiKeyId: apiKey.id,
      apiKeyScopes: scopes,
    };

    await this.rateLimitGuard.canActivate(context);
    this.enforceScope(context, scopes);
    await this.trackLastUsed(apiKey);

    return true;
  }

  private extractApiKey(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header) {
      return null;
    }

    const match = header.match(/^Bearer\s+(\S+)$/i);
    const token = match?.[1];
    return token?.startsWith(API_KEY_PREFIX) ? token : null;
  }

  private enforceScope(context: ExecutionContext, scopes: ApiKeyScope[]): void {
    const required = this.reflector.getAllAndOverride<RequiredPermission>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<Request>();
    const requiredScope = this.requiredScope(required, request.method);

    if (scopes.includes('admin') || scopes.includes(requiredScope)) {
      return;
    }

    throw new ForbiddenException(`API key requires the ${requiredScope} scope`);
  }

  private requiredScope(permission: RequiredPermission | undefined, method: string): ApiKeyScope {
    if (permission?.category === 'admin') {
      return 'admin';
    }
    if (permission) {
      return permission.action === 'read' ? 'read' : 'write';
    }
    return ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase()) ? 'read' : 'write';
  }

  private async trackLastUsed(apiKey: ApiKeyEntity): Promise<void> {
    const threshold = new Date(Date.now() - LAST_USED_DEBOUNCE_MS);
    if (apiKey.lastUsedAt && apiKey.lastUsedAt > threshold) {
      return;
    }

    await this.apiKeyRepo
      .createQueryBuilder()
      .update(ApiKeyEntity)
      .set({ lastUsedAt: new Date() })
      .where('id = :id', { id: apiKey.id })
      .andWhere('(last_used_at IS NULL OR last_used_at <= :threshold)', {
        threshold,
      })
      .execute();
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
