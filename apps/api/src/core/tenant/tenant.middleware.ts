import { Injectable, NestMiddleware, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request, Response, NextFunction } from 'express';
import { TenantEntity } from '@weaver/db';
import { tenantStorage } from './tenant.context';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(
    @InjectRepository(TenantEntity)
    private readonly tenantRepo: Repository<TenantEntity>,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    const tenantId = this.resolveTenantId(req);

    if (!tenantId) {
      next();
      return;
    }

    const tenant = await this.tenantRepo.findOneBy({ id: tenantId });
    if (!tenant) {
      throw new BadRequestException(`Tenant not found: ${tenantId}`);
    }

    tenantStorage.run(
      { tenantId: tenant.id, schemaName: tenant.schemaName },
      () => next(),
    );
  }

  private resolveTenantId(req: Request): string | undefined {
    // Priority: JWT claim > X-Tenant-ID header > subdomain
    const fromHeader = req.headers['x-tenant-id'] as string | undefined;
    if (fromHeader) return fromHeader;

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
