import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { ProjectMemberEntity } from '@weaver/db';
import { TenantConnectionProvider, requireTenantContext } from '../../core/tenant';

@Injectable()
export class ProjectMembersService {
  constructor(private readonly tenantConnections: TenantConnectionProvider) {}

  async findByProject(projectId: string): Promise<ProjectMemberEntity[]> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(ProjectMemberEntity);
    return repo.find({
      where: { projectId },
      order: { createdAt: 'ASC' },
    });
  }

  async add(
    projectId: string,
    userId: string,
    role?: string,
  ): Promise<ProjectMemberEntity> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(ProjectMemberEntity);

    if (role && !['lead', 'member', 'viewer'].includes(role)) throw new BadRequestException('Invalid project role');
    const memberships = await em.query('SELECT 1 FROM public.tenant_memberships WHERE tenant_id = $1 AND user_id = $2', [requireTenantContext().tenantId, userId]);
    if (!memberships.length) throw new BadRequestException('User must be a member of this tenant');
    const existing = await repo.findOneBy({ projectId, userId });
    if (existing) {
      throw new ConflictException('User is already a project member');
    }

    const member = repo.create({
      projectId,
      userId,
      role: role || 'member',
    });
    return repo.save(member);
  }

  async updateRole(
    projectId: string,
    userId: string,
    role: string,
  ): Promise<ProjectMemberEntity> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(ProjectMemberEntity);

    const member = await repo.findOneBy({ projectId, userId });
    if (!member) {
      throw new NotFoundException('Project member not found');
    }

    member.role = role;
    return repo.save(member);
  }

  async remove(projectId: string, userId: string): Promise<void> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(ProjectMemberEntity);

    const result = await repo.delete({ projectId, userId });
    if (result.affected === 0) {
      throw new NotFoundException('Project member not found');
    }
  }
}
