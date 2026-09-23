import { SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { RequestUser } from '../../core/auth';

export const AUDIT_METADATA = 'weaver:audit';

export type AuditableRequest = Request & { user?: RequestUser };

export interface AuditResolverContext {
  request: AuditableRequest;
  response?: unknown;
  before?: Record<string, unknown> | null;
}

export interface AuditOperation {
  action: string;
  resource: string;
  captureBefore?: boolean;
  resourceId?: (context: AuditResolverContext) => string | undefined;
}

export const Audit = (operation: AuditOperation) => SetMetadata(AUDIT_METADATA, operation);
