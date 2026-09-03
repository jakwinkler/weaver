import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import {
  BoardEntity,
  IssueEntity,
  ProjectEntity,
  ProjectMemberEntity,
  SprintEntity,
} from '@weaver/db';
import { CreateProjectDto, UpdateProjectDto, PaginatedResponse } from '@weaver/shared';
import { TenantConnectionProvider } from '../../core/tenant';
import { WorkflowsService } from '../workflows';
import { EventDispatcherService } from '../events';
import { ProjectPluginsService } from './project-plugins.service';
import { PaginationParams, paginate } from '../../common';
import { ProjectAccessService } from '../../core/tenant';
import type { RequestUser } from '../../core/auth';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly tenantConnections: TenantConnectionProvider,
    private readonly workflowsService: WorkflowsService,
    private readonly eventDispatcher: EventDispatcherService,
    private readonly projectPluginsService: ProjectPluginsService,
    private readonly projectAccess: ProjectAccessService,
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

    // Seed default project plugins
    await this.projectPluginsService.seedDefaults(saved.id);

    this.eventDispatcher.emit('project.created', {
      projectKey: saved.key,
      name: saved.name,
      leadUserId: userId,
    });

    return saved;
  }

  async findAll(
    params: PaginationParams,
    user: RequestUser,
  ): Promise<PaginatedResponse<ProjectEntity>> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(ProjectEntity);
    const qb = repo.createQueryBuilder('project');
    const projectIds = await this.projectAccess.accessibleProjectIds(user);
    if (projectIds !== null) {
      if (projectIds.length === 0) {
        qb.where('1 = 0');
      } else {
        qb.where('project.id IN (:...projectIds)', { projectIds });
      }
    }

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
    const [issueCount, boardCount, sprintCount] = await Promise.all([
      em.getRepository(IssueEntity).countBy({ projectId: project.id }),
      em.getRepository(BoardEntity).countBy({ projectId: project.id }),
      em.getRepository(SprintEntity).countBy({ projectId: project.id }),
    ]);
    if (issueCount || boardCount || sprintCount) {
      throw new ConflictException(
        'Project cannot be deleted while it contains issues, boards, or sprints',
      );
    }
    await repo.remove(project);
  }

  async incrementIssueCounter(projectId: string): Promise<number> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(ProjectEntity);

    const result = await repo
      .createQueryBuilder()
      .update(ProjectEntity)
      .set({ issueCounter: () => 'issue_counter + 1' })
      .where('id = :id', { id: projectId })
      .returning('issue_counter')
      .execute();

    const counter = result.raw[0]?.issue_counter;
    if (counter === undefined) {
      throw new NotFoundException(`Project "${projectId}" not found`);
    }

    return Number(counter);
  }
}
