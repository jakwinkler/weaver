import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { ProjectEntity, ProjectMemberEntity } from '@weaver/db';
import { CreateProjectDto, UpdateProjectDto, PaginatedResponse } from '@weaver/shared';
import { TenantConnectionProvider } from '../../core/tenant';
import { PaginationParams, paginate } from '../../common';

@Injectable()
export class ProjectsService {
  constructor(private readonly tenantConnections: TenantConnectionProvider) {}

  async create(dto: CreateProjectDto, userId: string): Promise<ProjectEntity> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(ProjectEntity);

    const existing = await repo.findOneBy({ key: dto.key });
    if (existing) {
      throw new ConflictException(`Project key "${dto.key}" already exists`);
    }

    const project = repo.create({
      key: dto.key,
      name: dto.name,
      description: dto.description,
      leadUserId: userId,
      issueCounter: 0,
    });

    const saved = await repo.save(project);

    // Auto-add creator as project lead member
    const memberRepo = em.getRepository(ProjectMemberEntity);
    const member = memberRepo.create({
      projectId: saved.id,
      userId,
      role: 'lead',
    });
    await memberRepo.save(member);

    return saved;
  }

  async findAll(params: PaginationParams): Promise<PaginatedResponse<ProjectEntity>> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(ProjectEntity);
    const qb = repo.createQueryBuilder('project');

    return paginate(qb, params, ['name', 'key', 'createdAt', 'updatedAt']);
  }

  async findByKey(key: string): Promise<ProjectEntity> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(ProjectEntity);
    const project = await repo.findOneBy({ key });
    if (!project) {
      throw new NotFoundException(`Project "${key}" not found`);
    }
    return project;
  }

  async update(key: string, dto: UpdateProjectDto & { customFields?: Record<string, unknown> }): Promise<ProjectEntity> {
    const project = await this.findByKey(key);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(ProjectEntity);

    Object.assign(project, dto);
    return repo.save(project);
  }

  async delete(key: string): Promise<void> {
    const project = await this.findByKey(key);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(ProjectEntity);
    await repo.remove(project);
  }

  async incrementIssueCounter(projectId: string): Promise<number> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(ProjectEntity);

    await repo
      .createQueryBuilder()
      .update(ProjectEntity)
      .set({ issueCounter: () => 'issue_counter + 1' })
      .where('id = :id', { id: projectId })
      .execute();

    const project = await repo.findOneByOrFail({ id: projectId });
    return project.issueCounter;
  }
}
