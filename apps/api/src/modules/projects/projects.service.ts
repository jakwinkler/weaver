import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { ProjectEntity, ProjectMemberEntity } from '@weaver/db';
import { CreateProjectDto, UpdateProjectDto, PaginatedResponse } from '@weaver/shared';
import { TenantConnectionProvider } from '../../core/tenant';
import { WorkflowsService } from '../workflows';
import { EventDispatcherService } from '../events';
import { PaginationParams, paginate } from '../../common';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly tenantConnections: TenantConnectionProvider,
    private readonly workflowsService: WorkflowsService,
    private readonly eventDispatcher: EventDispatcherService,
  ) {}

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

    // Auto-assign default workflow if one exists
    try {
      const defaultWorkflow = await this.workflowsService.getDefaultWorkflow();
      project.workflowId = defaultWorkflow.id;
    } catch {
      // No default workflow yet — leave workflowId null
    }

    const saved = await repo.save(project);

    // Auto-add creator as project lead member
    const memberRepo = em.getRepository(ProjectMemberEntity);
    const member = memberRepo.create({
      projectId: saved.id,
      userId,
      role: 'lead',
    });
    await memberRepo.save(member);

    this.eventDispatcher.emit('project.created', {
      projectKey: saved.key,
      name: saved.name,
      leadUserId: userId,
    });

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
    const saved = await repo.save(project);

    const changedFields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(dto)) {
      if (v !== undefined) changedFields[k] = v;
    }
    this.eventDispatcher.emit('project.updated', {
      projectKey: key,
      fields: changedFields,
    });

    return saved;
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
