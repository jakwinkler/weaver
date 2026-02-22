import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { ProjectMemberEntity } from '@weaver/db';
import { TenantConnectionProvider } from '../../core/tenant';

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
