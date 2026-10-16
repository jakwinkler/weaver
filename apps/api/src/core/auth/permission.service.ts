import { ForbiddenException, Injectable } from '@nestjs/common';
import { RoleEntity } from '@weaver/db';
import { TenantConnectionProvider } from '../tenant';
import type { RequiredPermission } from './require-permission.decorator';
import type { RequestUser } from './current-user.decorator';

/**
 * The one place that decides whether a tenant role grants a permission, so route guards and
 * field-level checks treat the owner role and the '*' wildcard the same way.
 */
@Injectable()
export class PermissionService {
  constructor(private readonly tenantConnections: TenantConnectionProvider) {}

  async assertPermissions(
    user: RequestUser | undefined,
    required: RequiredPermission[],
  ): Promise<void> {
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }
    if (required.length === 0 || user.role === 'owner') {
      return;
    }

    const em = await this.tenantConnections.getEntityManager();
    const role = await em.getRepository(RoleEntity).findOneBy({ name: user.role });
    if (!role) {
      throw new ForbiddenException('Role not found');
    }

    const permissions = role.permissions as Record<string, boolean>;
    if (permissions['*'] === true) {
      return;
    }

    for (const { category, action } of required) {
      const key = `${category}.${action}`;
      if (permissions[key] !== true) {
        throw new ForbiddenException(`Missing permission: ${key}`);
      }
    }
  }
}
