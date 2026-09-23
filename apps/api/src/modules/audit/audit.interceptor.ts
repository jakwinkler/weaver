import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { from, Observable, of } from 'rxjs';
import { concatMap, map, switchMap } from 'rxjs/operators';
import {
  AUDIT_METADATA,
  type AuditOperation,
  type AuditResolverContext,
  type AuditableRequest,
} from './audit.decorator';
import { AuditService } from './audit.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const operation = this.reflector.getAllAndOverride<AuditOperation>(AUDIT_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!operation || context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<AuditableRequest>();
    const user = request.user;
    if (!user?.userId || !user.tenantId) {
      return next.handle();
    }

    const initial: AuditResolverContext = { request };
    const locator = operation.resourceId?.(initial) ?? this.defaultResourceId(initial);
    const before = operation.captureBefore
      ? from(this.auditService.snapshot(operation.resource, locator, user.tenantId))
      : of(null);

    return before.pipe(
      switchMap((captured) =>
        next.handle().pipe(
          concatMap((response) => {
            const resolverContext = {
              request,
              response,
              before: captured,
            };
            const resourceId =
              operation.resourceId?.(resolverContext) ?? this.defaultResourceId(resolverContext);
            const after = this.buildAfterState(request, response, captured);
            const metadata: Record<string, unknown> = {};
            if (captured) metadata.before = captured;
            if (after) metadata.after = after;
            if (Object.keys(request.params ?? {}).length > 0) {
              metadata.context = request.params;
            }

            return from(
              this.auditService
                .log(
                  user.userId,
                  operation.action,
                  operation.resource,
                  resourceId,
                  metadata,
                  request,
                )
                .catch((error) => {
                  this.logger.error(
                    `Failed to record ${operation.action}`,
                    error instanceof Error ? error.stack : String(error),
                  );
                }),
            ).pipe(map(() => response));
          }),
        ),
      ),
    );
  }

  private defaultResourceId(context: AuditResolverContext): string {
    const response = this.asRecord(context.response);
    const before = context.before ?? {};
    const body = this.asRecord(context.request.body);
    const params = context.request.params ?? {};
    return String(
      response.id ??
        before.id ??
        params.id ??
        params.key ??
        params.userId ??
        body.pluginId ??
        context.request.user?.tenantId ??
        'unknown',
    );
  }

  private buildAfterState(
    request: Request,
    response: unknown,
    before: Record<string, unknown> | null,
  ): Record<string, unknown> | null {
    if (request.method === 'DELETE') return null;
    const body = this.asRecord(request.body);
    const result = this.asRecord(response);
    const state = { ...(before ?? {}), ...body, ...result };
    return Object.keys(state).length > 0
      ? (this.auditService.sanitize(state) as Record<string, unknown>)
      : null;
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
}
