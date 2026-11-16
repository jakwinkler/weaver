import { getTenantContext } from '../tenant/tenant.context';
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY, RequiredPermission } from './require-permission.decorator';
import { PermissionService } from './permission.service';
import type { RequestUser } from './current-user.decorator';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const actor = context.switchToHttp().getRequest().user;
    const tenant = getTenantContext();
    if (tenant && actor?.tenantId === tenant.tenantId) tenant.actor = actor;
    const required = this.reflector.getAllAndOverride<RequiredPermission>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: RequestUser = request.user;
    await this.permissions.assertPermissions(user, [required]);
    return true;
  }
}
