import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleEntity } from '@weaver/db';
import { TenantConnectionProvider } from '../tenant';
import {
  PERMISSION_KEY,
  RequiredPermission,
} from './require-permission.decorator';
import type { RequestUser } from './current-user.decorator';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantConnections: TenantConnectionProvider,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<RequiredPermission>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: RequestUser = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    if (user.role === 'owner') {
      return true;
    }

    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(RoleEntity);
    const role = await repo.findOneBy({ name: user.role });

    if (!role) {
      throw new ForbiddenException('Role not found');
    }

    const permissions = role.permissions as Record<string, boolean>;

    if (permissions['*'] === true) {
      return true;
    }

    const key = `${required.category}.${required.action}`;
    if (permissions[key] === true) {
      return true;
    }

    throw new ForbiddenException(
      `Missing permission: ${key}`,
    );
  }
}
