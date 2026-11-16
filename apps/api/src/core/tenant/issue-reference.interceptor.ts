import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { mergeMap } from 'rxjs';
import { TenantConnectionProvider } from './tenant-connection.provider';
import { getTenantContext } from './tenant.context';
import { redactIssueReferences } from './issue-reference-redaction';

@Injectable()
export class IssueReferenceInterceptor implements NestInterceptor {
  constructor(private readonly connections: TenantConnectionProvider) {}
  intercept(context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(
      mergeMap(async (value: unknown) => {
        const response = context.switchToHttp().getResponse();
        if (response.headersSent || value === response) return value;
        const tenant = getTenantContext();
        const actor = tenant?.actor ?? context.switchToHttp().getRequest().user;
        if (!tenant || !actor || ['owner', 'admin'].includes(actor.role) || value == null)
          return value;
        return redactIssueReferences(await this.connections.getEntityManager(), value, actor);
      }),
    );
  }
}
