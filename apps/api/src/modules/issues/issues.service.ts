import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { IssueEntity, WorkflowStatusEntity, ActivityLogEntity } from '@weaver/db';
import { CreateIssueDto, UpdateIssueDto, PaginatedResponse } from '@weaver/shared';
import { TenantConnectionProvider } from '../../core/tenant';
import { ProjectsService } from '../projects';
import { WorkflowsService } from '../workflows';
import { PaginationParams, paginate } from '../../common';

@Injectable()
export class IssuesService {
  constructor(
    private readonly tenantConnections: TenantConnectionProvider,
    private readonly projectsService: ProjectsService,
    private readonly workflowsService: WorkflowsService,
  ) {}

  async create(projectKey: string, dto: CreateIssueDto, reporterId: string): Promise<IssueEntity> {
    const project = await this.projectsService.findByKey(projectKey);
    const em = await this.tenantConnections.getEntityManager();

    // Get initial status from default workflow
    const initialStatus = await em.getRepository(WorkflowStatusEntity).findOneBy({
      isInitial: true,
    });
    if (!initialStatus) {
      throw new NotFoundException('No initial workflow status found');
    }

    // Atomically increment issue counter
    const counter = await this.projectsService.incrementIssueCounter(project.id);
    const issueKey = `${project.key}-${counter}`;

    const repo = em.getRepository(IssueEntity);
    const issue = repo.create({
      projectId: project.id,
      key: issueKey,
      summary: dto.summary,
      description: dto.description,
      statusId: initialStatus.id,
      issueTypeId: dto.issueTypeId,
      priority: dto.priority || 'medium',
      assigneeId: dto.assigneeId,
      reporterId,
      customFields: dto.customFields || {},
      parentId: dto.parentId,
      epicId: dto.epicId,
      labels: dto.labels || [],
      sortOrder: 0,
    });

    return repo.save(issue);
  }

  async findByKey(issueKey: string): Promise<IssueEntity> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(IssueEntity);
    const issue = await repo.findOneBy({ key: issueKey });
    if (!issue) {
      throw new NotFoundException(`Issue "${issueKey}" not found`);
    }
    return issue;
  }

  async findByProject(projectKey: string, params: PaginationParams): Promise<PaginatedResponse<IssueEntity>> {
    const project = await this.projectsService.findByKey(projectKey);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(IssueEntity);

    const qb = repo
      .createQueryBuilder('issue')
      .where('issue.projectId = :projectId', { projectId: project.id });

    return paginate(qb, params, ['summary', 'priority', 'createdAt', 'updatedAt', 'key', 'sortOrder']);
  }

  async update(issueKey: string, dto: UpdateIssueDto): Promise<IssueEntity> {
    const issue = await this.findByKey(issueKey);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(IssueEntity);

    // Handle nullable fields explicitly
    if (dto.assigneeId !== undefined) issue.assigneeId = dto.assigneeId ?? null;
    if (dto.parentId !== undefined) issue.parentId = dto.parentId ?? null;
    if (dto.epicId !== undefined) issue.epicId = dto.epicId ?? null;
    if (dto.summary !== undefined) issue.summary = dto.summary;
    if (dto.description !== undefined) issue.description = dto.description;
    if (dto.priority !== undefined) issue.priority = dto.priority;
    if (dto.labels !== undefined) issue.labels = dto.labels;
    if (dto.customFields !== undefined) issue.customFields = dto.customFields;
    if (dto.sortOrder !== undefined) issue.sortOrder = dto.sortOrder;

    return repo.save(issue);
  }

  async transition(issueKey: string, transitionId: string, userId: string): Promise<IssueEntity> {
    const issue = await this.findByKey(issueKey);
    const em = await this.tenantConnections.getEntityManager();

    // Look up the transition
    const { WorkflowTransitionEntity } = await import('@weaver/db');
    const transitionRepo = em.getRepository(WorkflowTransitionEntity);
    const transition = await transitionRepo.findOne({
      where: { id: transitionId },
      relations: ['toStatus'],
    });

    if (!transition) {
      throw new BadRequestException(`Transition "${transitionId}" not found`);
    }

    // Validate the transition starts from the current status
    if (transition.fromStatusId !== issue.statusId) {
      throw new BadRequestException(
        `Transition is not valid from the current status`,
      );
    }

    const oldStatusId = issue.statusId;
    issue.statusId = transition.toStatusId;

    const issueRepo = em.getRepository(IssueEntity);
    const saved = await issueRepo.save(issue);

    // Log activity
    const activityRepo = em.getRepository(ActivityLogEntity);
    const activity = activityRepo.create({
      issueId: issue.id,
      userId,
      action: 'transitioned',
      fieldName: 'status',
      oldValue: oldStatusId,
      newValue: transition.toStatusId,
    });
    await activityRepo.save(activity);

    return saved;
  }

  async delete(issueKey: string): Promise<void> {
    const issue = await this.findByKey(issueKey);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(IssueEntity);
    await repo.remove(issue);
  }
}
