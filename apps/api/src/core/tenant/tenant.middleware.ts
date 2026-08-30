import { createHash } from 'crypto';
import { Injectable, NestMiddleware, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request, Response, NextFunction } from 'express';
import { ApiKeyEntity, TenantEntity } from '@weaver/db';
import { API_KEY_PREFIX } from '@weaver/shared';
import { tenantStorage } from './tenant.context';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function decodeTenantFromCookie(req: Request): string | undefined {
  const token = req.cookies?.weaver_token;
  if (!token) return undefined;
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    if (payload.tenantId && UUID_RE.test(payload.tenantId)) {
      return payload.tenantId;
    }
  } catch {
    // ignore malformed tokens
  }
  return undefined;
}

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(
    @InjectRepository(TenantEntity)
    private readonly tenantRepo: Repository<TenantEntity>,
    @InjectRepository(ApiKeyEntity)
    private readonly apiKeyRepo: Repository<ApiKeyEntity>,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    // Skip tenant resolution for auth routes and public routes (resolved by slug)
    if (req.originalUrl.includes('/auth/') || req.originalUrl.includes('/api/v1/public/')) {
      next();
      return;
    }

    const tenantId = await this.resolveTenantId(req);

    if (!tenantId) {
      next();
      return;
    }

    const tenant = await this.tenantRepo.findOneBy({ id: tenantId });
    if (!tenant) {
      throw new BadRequestException(`Tenant not found: ${tenantId}`);
    }

    tenantStorage.run({ tenantId: tenant.id, schemaName: tenant.schemaName }, () => next());
  }

  private async resolveTenantId(req: Request): Promise<string | undefined> {
    // Priority: X-Tenant-ID header > API key > JWT cookie > subdomain
    const fromHeader = req.headers['x-tenant-id'] as string | undefined;
    if (fromHeader && UUID_RE.test(fromHeader)) return fromHeader;

    const apiKey = req.headers.authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (apiKey?.startsWith(API_KEY_PREFIX)) {
      const keyHash = createHash('sha256').update(apiKey).digest('hex');
      const storedKey = await this.apiKeyRepo.findOne({
        select: { tenantId: true },
        where: { keyHash },
      });
      if (storedKey) return storedKey.tenantId;
    }

    // Extract tenantId from JWT cookie (for browser requests like <img src>)
    const fromCookie = decodeTenantFromCookie(req);
    if (fromCookie) return fromCookie;

    // JWT-based tenant will be set later by auth guard
    const user = (req as any).user;
    if (user?.tenantId) return user.tenantId;

    // Subdomain extraction (e.g., acme.weaver.dev)
    const host = req.headers.host;
    if (host) {
      const parts = host.split('.');
      if (parts.length > 2) {
        // This would need a DB lookup by slug, not ID
        // For now, only support header-based resolution
      }
    }

    return undefined;
  }
}
