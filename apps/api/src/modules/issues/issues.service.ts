import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  IssueEntity,
  WorkflowStatusEntity,
  ActivityLogEntity,
  SprintEntity,
  IssueLinkEntity,
} from '@weaver/db';
import { UserEntity } from '@weaver/db';
import {
  CreateIssueDto,
  UpdateIssueDto,
  ReorderIssuesDto,
  PaginatedResponse,
  RoadmapEpic,
  RoadmapStatus,
} from '@weaver/shared';
import { Repository, In } from 'typeorm';
import { TenantConnectionProvider } from '../../core/tenant';
import { ProjectsService } from '../projects';
import { WorkflowsService } from '../workflows';
import { EventDispatcherService } from '../events';
import { PaginationParams, paginate } from '../../common';

export interface IssueFilters {
  statusId?: string;
  assigneeId?: string;
  priority?: string;
  startDateFrom?: string;
  startDateTo?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
}

@Injectable()
export class IssuesService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly tenantConnections: TenantConnectionProvider,
    private readonly projectsService: ProjectsService,
    private readonly workflowsService: WorkflowsService,
    private readonly eventDispatcher: EventDispatcherService,
  ) {}

  private async resolveUserName(userId: string | null): Promise<string | null> {
    if (!userId) return null;
    const user = await this.userRepo.findOneBy({ id: userId });
    return user?.displayName || user?.email || userId;
  }

  private async resolveStatusName(em: any, statusId: string | null): Promise<string | null> {
    if (!statusId) return null;
    const status = await em.getRepository(WorkflowStatusEntity).findOneBy({ id: statusId });
    return status?.name || statusId;
  }

  private async resolveSprintName(em: any, sprintId: string | null): Promise<string | null> {
    if (!sprintId) return null;
    const sprint = await em.getRepository(SprintEntity).findOneBy({ id: sprintId });
    return sprint?.name || sprintId;
  }

  async create(projectKey: string, dto: CreateIssueDto, reporterId: string): Promise<IssueEntity> {
    const project = await this.projectsService.findByKey(projectKey);
    const em = await this.tenantConnections.getEntityManager();

    // Resolve workflow: project-specific or default
    const workflowId = project.workflowId
      || (await this.workflowsService.getDefaultWorkflow()).id;

    const initialStatus = await em.getRepository(WorkflowStatusEntity).findOneBy({
      workflowId,
      isInitial: true,
    });
    if (!initialStatus) {
      throw new NotFoundException('No initial status found in the project workflow');
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
      startDate: dto.startDate ?? null,
      dueDate: dto.dueDate ?? null,
      percentDone: dto.percentDone ?? 0,
      storyPoints: dto.storyPoints ?? null,
    });

    const saved = await repo.save(issue);

    this.eventDispatcher.emit('issue.created', {
      issueKey: saved.key,
      projectKey: project.key,
      summary: saved.summary,
      priority: saved.priority,
      assigneeId: saved.assigneeId,
      userId: reporterId,
    });

    return saved;
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

  async findByProject(
    projectKey: string,
    params: PaginationParams,
    filters?: IssueFilters,
  ): Promise<PaginatedResponse<IssueEntity>> {
    const project = await this.projectsService.findByKey(projectKey);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(IssueEntity);

    const qb = repo
      .createQueryBuilder('issue')
      .leftJoinAndSelect('issue.issueType', 'issueType')
      .where('issue.projectId = :projectId', { projectId: project.id });

    if (filters) {
      if (filters.statusId) qb.andWhere('issue.statusId = :statusId', { statusId: filters.statusId });
      if (filters.assigneeId) qb.andWhere('issue.assigneeId = :assigneeId', { assigneeId: filters.assigneeId });
      if (filters.priority) qb.andWhere('issue.priority = :priority', { priority: filters.priority });
      if (filters.startDateFrom) qb.andWhere('issue.startDate >= :startDateFrom', { startDateFrom: filters.startDateFrom });
      if (filters.startDateTo) qb.andWhere('issue.startDate <= :startDateTo', { startDateTo: filters.startDateTo });
      if (filters.dueDateFrom) qb.andWhere('issue.dueDate >= :dueDateFrom', { dueDateFrom: filters.dueDateFrom });
      if (filters.dueDateTo) qb.andWhere('issue.dueDate <= :dueDateTo', { dueDateTo: filters.dueDateTo });
    }

    return paginate(qb, params, ['summary', 'priority', 'createdAt', 'updatedAt', 'key', 'sortOrder', 'startDate', 'dueDate', 'percentDone', 'storyPoints']);
  }

  async findEpicsByProject(projectKey: string): Promise<RoadmapEpic[]> {
    const project = await this.projectsService.findByKey(projectKey);
    const em = await this.tenantConnections.getEntityManager();
    const issueRepo = em.getRepository(IssueEntity);

    const epics = await issueRepo
      .createQueryBuilder('issue')
      .innerJoinAndSelect('issue.issueType', 'issueType')
      .leftJoinAndSelect('issue.status', 'status')
      .where('issue.projectId = :projectId', { projectId: project.id })
      .andWhere('issueType.slug = :epicSlug', { epicSlug: 'epic' })
      .orderBy('issue.startDate', 'ASC', 'NULLS LAST')
      .addOrderBy('issue.key', 'ASC')
      .getMany();

    if (epics.length === 0) return [];

    const epicIds = epics.map((epic) => epic.id);
    const [children, links] = await Promise.all([
      issueRepo
        .createQueryBuilder('issue')
        .leftJoinAndSelect('issue.status', 'status')
        .where('issue.projectId = :projectId', { projectId: project.id })
        .andWhere('issue.epicId IN (:...epicIds)', { epicIds })
        .orderBy('issue.sortOrder', 'ASC')
        .addOrderBy('issue.key', 'ASC')
        .getMany(),
      em.getRepository(IssueLinkEntity).find({
        where: { sourceIssueId: In(epicIds), linkType: 'blocks' },
        order: { createdAt: 'ASC' },
      }),
    ]);

    const epicIdSet = new Set(epicIds);
    const childrenByEpic = new Map<string, IssueEntity[]>();
    for (const child of children) {
      if (!child.epicId) continue;
      const epicChildren = childrenByEpic.get(child.epicId) ?? [];
      epicChildren.push(child);
      childrenByEpic.set(child.epicId, epicChildren);
    }

    const blockingByEpic = new Map<string, string[]>();
    for (const link of links) {
      if (!epicIdSet.has(link.targetIssueId)) continue;
      const targets = blockingByEpic.get(link.sourceIssueId) ?? [];
      targets.push(link.targetIssueId);
      blockingByEpic.set(link.sourceIssueId, targets);
    }

    return epics.map((epic) => {
      const epicChildren = childrenByEpic.get(epic.id) ?? [];
      const completedChildren = epicChildren.filter((child) => child.status?.isTerminal);
      const totalStoryPoints = epicChildren.reduce(
        (total, child) => total + (child.storyPoints ?? 0),
        0,
      );
      const completedStoryPoints = completedChildren.reduce(
        (total, child) => total + (child.storyPoints ?? 0),
        0,
      );
      const childStartDates = epicChildren
        .map((child) => child.startDate)
        .filter((date): date is string => Boolean(date));
      const childDueDates = epicChildren
        .map((child) => child.dueDate)
        .filter((date): date is string => Boolean(date));
      const derivedStartDate = childStartDates.sort()[0] ?? null;
      const derivedDueDate = childDueDates.sort().at(-1) ?? null;

      return {
        id: epic.id,
        key: epic.key,
        summary: epic.summary,
        statusId: epic.statusId,
        status: this.toRoadmapStatus(epic.status),
        startDate: epic.startDate ?? derivedStartDate,
        dueDate: epic.dueDate ?? derivedDueDate,
        childIssueCount: epicChildren.length,
        completedChildCount: completedChildren.length,
        totalStoryPoints,
        completedStoryPoints,
        progress: epicChildren.length === 0 ? 0 : completedChildren.length / epicChildren.length,
        pointsProgress: totalStoryPoints === 0 ? 0 : completedStoryPoints / totalStoryPoints,
        blockingEpicIds: blockingByEpic.get(epic.id) ?? [],
        children: epicChildren.map((child) => ({
          id: child.id,
          key: child.key,
          summary: child.summary,
          statusId: child.statusId,
          status: this.toRoadmapStatus(child.status),
          startDate: child.startDate,
          dueDate: child.dueDate,
          storyPoints: child.storyPoints,
        })),
      };
    });
  }

  private toRoadmapStatus(status: WorkflowStatusEntity): RoadmapStatus {
    return {
      id: status.id,
      name: status.name,
      category: status.category,
      color: status.color,
      isTerminal: status.isTerminal,
    };
  }

  async update(issueKey: string, dto: UpdateIssueDto, userId?: string): Promise<IssueEntity> {
    const issue = await this.findByKey(issueKey);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(IssueEntity);

    const previousAssigneeId = issue.assigneeId;
    const previousStatusId = issue.statusId;
    const previousSprintId = issue.sprintId;
    const previousPriority = issue.priority;
    const previousStartDate = issue.startDate;
    const previousDueDate = issue.dueDate;
    const previousSummary = issue.summary;
    const previousPercentDone = issue.percentDone;
    const previousStoryPoints = issue.storyPoints;

    // Handle nullable fields explicitly
    if (dto.assigneeId !== undefined) issue.assigneeId = dto.assigneeId ?? null;
    if (dto.parentId !== undefined) issue.parentId = dto.parentId ?? null;
    if (dto.epicId !== undefined) issue.epicId = dto.epicId ?? null;
    if (dto.sprintId !== undefined) issue.sprintId = dto.sprintId ?? null;
    if (dto.statusId !== undefined) issue.statusId = dto.statusId;
    if (dto.summary !== undefined) issue.summary = dto.summary;
    if (dto.description !== undefined) issue.description = dto.description;
    if (dto.priority !== undefined) issue.priority = dto.priority;
    if (dto.labels !== undefined) issue.labels = dto.labels;
    if (dto.customFields !== undefined) issue.customFields = dto.customFields;
    if (dto.sortOrder !== undefined) issue.sortOrder = dto.sortOrder;
    if (dto.startDate !== undefined) issue.startDate = dto.startDate ?? null;
    if (dto.dueDate !== undefined) issue.dueDate = dto.dueDate ?? null;
    if (dto.percentDone !== undefined) issue.percentDone = dto.percentDone;
    if (dto.storyPoints !== undefined) issue.storyPoints = dto.storyPoints ?? null;

    const saved = await repo.save(issue);

    // Build changed fields for the update event
    const changedFields: Record<string, unknown> = {};
    for (const key of Object.keys(dto) as (keyof UpdateIssueDto)[]) {
      if (dto[key] !== undefined) {
        changedFields[key] = dto[key];
      }
    }

    this.eventDispatcher.emit('issue.updated', {
      issueKey,
      projectKey: issueKey.split('-')[0],
      fields: changedFields,
      userId: userId ?? null,
    });

    // Log activity for tracked field changes
    if (userId) {
      const activityRepo = em.getRepository(ActivityLogEntity);
      const trackedChanges: { field: string; oldVal: string | null; newVal: string | null }[] = [];

      if (dto.assigneeId !== undefined && dto.assigneeId !== previousAssigneeId) {
        const [oldName, newName] = await Promise.all([
          this.resolveUserName(previousAssigneeId ?? null),
          this.resolveUserName(dto.assigneeId ?? null),
        ]);
        trackedChanges.push({ field: 'assignee', oldVal: oldName, newVal: newName });
      }
      if (dto.statusId !== undefined && dto.statusId !== previousStatusId) {
        const [oldName, newName] = await Promise.all([
          this.resolveStatusName(em, previousStatusId),
          this.resolveStatusName(em, dto.statusId),
        ]);
        trackedChanges.push({ field: 'status', oldVal: oldName, newVal: newName });
      }
      if (dto.sprintId !== undefined && dto.sprintId !== previousSprintId) {
        const [oldName, newName] = await Promise.all([
          this.resolveSprintName(em, previousSprintId ?? null),
          this.resolveSprintName(em, dto.sprintId ?? null),
        ]);
        trackedChanges.push({ field: 'sprint', oldVal: oldName, newVal: newName });
      }
      if (dto.priority !== undefined && dto.priority !== previousPriority) {
        trackedChanges.push({ field: 'priority', oldVal: previousPriority, newVal: dto.priority });
      }
      if (dto.startDate !== undefined && (dto.startDate ?? null) !== (previousStartDate ?? null)) {
        trackedChanges.push({ field: 'startDate', oldVal: previousStartDate ?? null, newVal: dto.startDate ?? null });
      }
      if (dto.dueDate !== undefined && (dto.dueDate ?? null) !== (previousDueDate ?? null)) {
        trackedChanges.push({ field: 'dueDate', oldVal: previousDueDate ?? null, newVal: dto.dueDate ?? null });
      }
      if (dto.summary !== undefined && dto.summary !== previousSummary) {
        trackedChanges.push({ field: 'summary', oldVal: previousSummary, newVal: dto.summary });
      }
      if (dto.percentDone !== undefined && dto.percentDone !== previousPercentDone) {
        trackedChanges.push({ field: 'percentDone', oldVal: String(previousPercentDone), newVal: String(dto.percentDone) });
      }
      if (dto.storyPoints !== undefined && (dto.storyPoints ?? null) !== previousStoryPoints) {
        trackedChanges.push({
          field: 'storyPoints',
          oldVal: previousStoryPoints === null ? null : String(previousStoryPoints),
          newVal: dto.storyPoints === null ? null : String(dto.storyPoints),
        });
      }

      for (const change of trackedChanges) {
        const activity = activityRepo.create({
          issueId: issue.id,
          userId,
          action: 'updated',
          fieldName: change.field,
          oldValue: change.oldVal,
          newValue: change.newVal,
        });
        await activityRepo.save(activity);
      }
    }

    // Emit specific assigned event if assignee changed
    if (dto.assigneeId !== undefined && dto.assigneeId !== previousAssigneeId) {
      this.eventDispatcher.emit('issue.assigned', {
        issueKey,
        projectKey: issueKey.split('-')[0],
        assigneeId: saved.assigneeId,
        previousAssigneeId,
        userId: userId ?? null,
      });
    }

    // Emit issue.moved event if status or sprint changed
    const statusChanged = dto.statusId !== undefined && dto.statusId !== previousStatusId;
    const sprintChanged = dto.sprintId !== undefined && dto.sprintId !== previousSprintId;
    if (statusChanged || sprintChanged) {
      this.eventDispatcher.emit('issue.moved', {
        issueKey,
        projectKey: issueKey.split('-')[0],
        fromStatus: previousStatusId,
        toStatus: saved.statusId,
        fromSprint: previousSprintId ?? null,
        toSprint: saved.sprintId ?? null,
        userId: userId ?? null,
      });
    }

    return saved;
  }

  async reorder(dto: ReorderIssuesDto): Promise<void> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(IssueEntity);

    const ids = dto.issues.map((i) => i.id);
    const issues = await repo.find({ where: { id: In(ids) } });

    if (issues.length !== ids.length) {
      throw new NotFoundException('One or more issues not found');
    }

    const orderMap = new Map(dto.issues.map((i) => [i.id, i.sortOrder]));
    for (const issue of issues) {
      issue.sortOrder = orderMap.get(issue.id)!;
    }

    await repo.save(issues);
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

    // Log activity with human-readable status names
    const [oldStatusName, newStatusName] = await Promise.all([
      this.resolveStatusName(em, oldStatusId),
      this.resolveStatusName(em, transition.toStatusId),
    ]);
    const activityRepo = em.getRepository(ActivityLogEntity);
    const activity = activityRepo.create({
      issueId: issue.id,
      userId,
      action: 'transitioned',
      fieldName: 'status',
      oldValue: oldStatusName,
      newValue: newStatusName,
    });
    await activityRepo.save(activity);

    this.eventDispatcher.emit('issue.status_changed', {
      issueKey,
      projectKey: issueKey.split('-')[0],
      fromStatus: oldStatusId,
      toStatus: transition.toStatusId,
      userId,
    });

    return saved;
  }

  async delete(issueKey: string): Promise<void> {
    const issue = await this.findByKey(issueKey);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(IssueEntity);
    await repo.remove(issue);

    this.eventDispatcher.emit('issue.deleted', { issueKey, projectKey: issueKey.split('-')[0] });
  }
}
