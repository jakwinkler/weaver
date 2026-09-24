import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import type { RequestUser } from '../../core/auth';
import { RoleEntity } from '@weaver/db';
import { TenantConnectionProvider } from '../../core/tenant';

@Injectable()
export class RolesService {
  constructor(private readonly tenantConnections: TenantConnectionProvider) {}

  async findAll(): Promise<RoleEntity[]> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(RoleEntity);

    return repo.find({ order: { name: 'ASC' } });
  }

  async findById(id: string): Promise<RoleEntity> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(RoleEntity);

    const role = await repo.findOneBy({ id });
    if (!role) {
      throw new NotFoundException(`Role "${id}" not found`);
    }

    return role;
  }

  async create(dto: {
    name: string;
    permissions: Record<string, unknown>;
  }, actor: RequestUser): Promise<RoleEntity> {
    await this.assertDelegatedChange(actor, dto);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(RoleEntity);

    const role = repo.create({
      name: dto.name,
      permissions: dto.permissions,
      isSystem: false,
    });

    return repo.save(role);
  }

  async update(
    id: string,
    dto: Partial<{ name: string; permissions: Record<string, unknown> }>,
    actor: RequestUser,
  ): Promise<RoleEntity> {
    const role = await this.findById(id);
    await this.assertDelegatedChange(actor, dto, role);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(RoleEntity);

    if (role.isSystem && dto.name && dto.name !== role.name) {
      throw new BadRequestException('Cannot rename a system role');
    }

    Object.assign(role, dto);
    return repo.save(role);
  }

  async delete(id: string, actor: RequestUser): Promise<void> {
    const role = await this.findById(id);
    await this.assertDelegatedChange(actor, {}, role);

    if (role.isSystem) {
      throw new BadRequestException('Cannot delete a system role');
    }

    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(RoleEntity);
    await repo.remove(role);
  }

  private async assertDelegatedChange(
    actor: RequestUser,
    dto: Partial<{ name: string; permissions: Record<string, unknown> }>,
    target?: RoleEntity,
  ): Promise<void> {
    if (actor.role === 'owner' || actor.role === 'admin') return;
    if (target?.isSystem || target?.name === actor.role || (dto.name && ['owner', 'admin', 'member', 'viewer'].includes(dto.name))) {
      throw new ForbiddenException('Only administrators can change system roles or their own role');
    }
    const em = await this.tenantConnections.getEntityManager();
    const ownRole = await em.getRepository(RoleEntity).findOneBy({ name: actor.role });
    for (const [permission, granted] of Object.entries(dto.permissions ?? {})) {
      if (granted === true && (permission === '*' || permission.startsWith('admin.') || ownRole?.permissions[permission] !== true)) {
        throw new ForbiddenException('Cannot grant permissions outside your delegated authority');
      }
    }
  }

  async seedDefaults(): Promise<void> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(RoleEntity);

    const defaults = [
      {
        name: 'admin',
        permissions: { '*': true },
        isSystem: true,
      },
      {
        name: 'member',
        permissions: {
          'projects.read': true,
          'issues.create': true,
          'issues.read': true,
          'issues.update': true,
          'issues.transition': true,
          'issues.assign': true,
          'comments.create': true,
          'comments.read': true,
          'comments.update': true,
          'pages.create': true,
          'pages.read': true,
          'pages.update': true,
          'sprints.read': true,
          'custom_fields.read': true,
        },
        isSystem: true,
      },
      {
        name: 'viewer',
        permissions: {
          'projects.read': true,
          'issues.read': true,
          'comments.read': true,
          'pages.read': true,
          'sprints.read': true,
        },
        isSystem: true,
      },
    ];

    for (const def of defaults) {
      const existing = await repo.findOneBy({ name: def.name });
      if (!existing) {
        await repo.save(repo.create(def));
        continue;
      }

      if (existing.isSystem) {
        existing.permissions = {
          ...def.permissions,
          ...existing.permissions,
        };
        await repo.save(existing);
      }
    }
  }
}
