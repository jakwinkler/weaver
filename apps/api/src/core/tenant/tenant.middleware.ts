import { apiPath } from '../security/api-prefix';
import {
  Injectable,
  NestMiddleware,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request, Response, NextFunction } from 'express';
import { ApiKeyEntity, TenantEntity, TenantMembershipEntity } from '@weaver/db';
import { API_KEY_PREFIX } from '@weaver/shared';
import { createHash } from 'crypto';
import type { JwtPayload } from '../auth/auth.service';
import { tenantStorage } from './tenant.context';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractToken(req: Request): string | undefined {
  const authorization = req.headers.authorization;
  const bearerMatch = authorization?.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) {
    return bearerMatch[1];
  }

  return req.cookies?.weaver_token;
}

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(
    @InjectRepository(TenantEntity)
    private readonly tenantRepo: Repository<TenantEntity>,
    @InjectRepository(TenantMembershipEntity)
    private readonly membershipRepo: Repository<TenantMembershipEntity>,
    private readonly jwtService: JwtService,
    @InjectRepository(ApiKeyEntity)
    private readonly apiKeyRepo: Repository<ApiKeyEntity>,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    // Skip only core auth and public endpoints, never similarly named plugin paths.
    const requestPath = req.originalUrl.split('?')[0];
    if (
      ['auth', 'public'].some((route) => requestPath === apiPath(route) || requestPath.startsWith(`${apiPath(route)}/`))
    ) {
      next();
      return;
    }

    const identity = await this.resolveIdentity(req);

    if (!identity) {
      next();
      return;
    }

    const membership = await this.membershipRepo.findOneBy({
      tenantId: identity.tenantId,
      userId: identity.userId,
    });
    if (!membership) {
      throw new ForbiddenException('Tenant membership required');
    }

    (req as Request & { tenantMembershipRole?: string }).tenantMembershipRole =
      membership.role;

    const tenant = await this.tenantRepo.findOneBy({ id: identity.tenantId });
    if (!tenant) {
      throw new BadRequestException(`Tenant not found: ${identity.tenantId}`);
    }

    tenantStorage.run(
      { tenantId: tenant.id, schemaName: tenant.schemaName },
      () => next(),
    );
  }

  private async resolveIdentity(
    req: Request,
  ): Promise<{ tenantId: string; userId: string } | undefined> {
    const token = extractToken(req);
    if (!token) {
      return undefined;
    }

    let payload: Pick<JwtPayload, 'sub' | 'tenantId' | 'tokenType'>;
    if (token.startsWith(API_KEY_PREFIX)) {
      const key = await this.apiKeyRepo.findOneBy({ keyHash: createHash('sha256').update(token).digest('hex') });
      if (!key) throw new UnauthorizedException('Invalid API key');
      if (key.expiresAt && key.expiresAt.getTime() <= Date.now()) {
        throw new UnauthorizedException('API key has expired');
      }
      payload = { sub: key.userId, tenantId: key.tenantId, tokenType: 'access' };
    } else {
      try {
        payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      } catch {
        return undefined;
      }
    }

    if (
      payload.tokenType !== 'access' ||
      !payload.sub ||
      !payload.tenantId ||
      !UUID_RE.test(payload.tenantId)
    ) {
      throw new UnauthorizedException('Invalid tenant claim');
    }

    const tenantHeader = req.headers['x-tenant-id'];
    if (Array.isArray(tenantHeader)) {
      throw new BadRequestException('X-Tenant-ID must be a single UUID');
    }
    if (tenantHeader && !UUID_RE.test(tenantHeader)) {
      throw new BadRequestException('X-Tenant-ID must be a UUID');
    }
    if (tenantHeader && tenantHeader !== payload.tenantId) {
      throw new ForbiddenException('X-Tenant-ID does not match authenticated tenant');
    }

    return { tenantId: payload.tenantId, userId: payload.sub };
  }
}
