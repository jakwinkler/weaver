import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  ActivityLogEntity,
  AttachmentEntity,
  CommentEntity,
  IssueEntity,
  IssueLinkEntity,
  ProjectEntity,
  SprintEntity,
  WorkflowEntity,
  WorkflowStatusEntity,
  WorkflowTransitionEntity,
  TimeEntryEntity,
} from '@weaver/db';
import { UserEntity } from '@weaver/db';
import { BulkIssueUpdatesDto, CreateIssueDto, MoveIssueSprintDto, UpdateIssueDto, ReorderIssuesDto, PaginatedResponse, RoadmapEpic, RoadmapStatus } from '@weaver/shared';
import { EntityManager, Repository, In } from 'typeorm';
import { requireTenantContext, TenantConnectionProvider } from '../../core/tenant';
import { ProjectsService } from '../projects';
import { ConditionEvaluatorRegistry, PostFunctionRegistry, WorkflowsService } from '../workflows';
import { EventDispatcherService } from '../events';
import { PaginationParams, paginate } from '../../common';
import { getTenantContext } from '../../core/tenant';
import { MailService } from '../mail';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { StorageService } from '../../core/storage';

export interface IssueFilters {
  statusId?: string;
  assigneeId?: string;
  priority?: string;
  issueTypeId?: string;
  startDateFrom?: string;
  startDateTo?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
}

interface RecurrenceInstanceOptions {
  parentId: string;
  occurrence: number;
}

@Injectable()
export class IssuesService {
  private readonly logger = new Logger(IssuesService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly tenantConnections: TenantConnectionProvider,
    private readonly projectsService: ProjectsService,
    private readonly workflowsService: WorkflowsService,
    private readonly eventDispatcher: EventDispatcherService,
    private readonly mailService: MailService,
    private readonly conditionEvaluators: ConditionEvaluatorRegistry,
    private readonly postFunctions: PostFunctionRegistry,
    private readonly customFieldsService: CustomFieldsService,
    private readonly storage: StorageService,
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

  async create(
    projectKey: string,
    dto: CreateIssueDto,
    reporterId: string,
    recurrence?: RecurrenceInstanceOptions,
  ): Promise<IssueEntity> {
    const project = await this.projectsService.findByKey(projectKey);
    const em = await this.tenantConnections.getEntityManager();

    await this.customFieldsService.validateCustomFields(dto.customFields ?? {});

    // Resolve workflow: project-specific or default
    const workflowId = project.workflowId || (await this.workflowsService.getDefaultWorkflow()).id;

    const initialStatus = await em.getRepository(WorkflowStatusEntity).findOneBy({
      workflowId,
      isInitial: true,
    });
    if (!initialStatus) {
      throw new NotFoundException('No initial status found in the project workflow');
    }

    await this.assertValidHierarchyTarget(
      em,
      null,
      project.id,
      dto.parentId ?? null,
      'parent',
    );
    await this.assertValidHierarchyTarget(
      em,
      null,
      project.id,
      dto.epicId ?? null,
      'epic',
    );

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
      sortOrder: (counter - 1) * 1000,
      startDate: dto.startDate ?? null,
      dueDate: dto.dueDate ?? null,
      percentDone: dto.percentDone ?? 0,
      storyPoints: dto.storyPoints ?? null,
      recurrenceRule: dto.recurrenceRule ?? null,
      recurrenceParentId: recurrence?.parentId ?? null,
      recurrenceOccurrence: recurrence?.occurrence ?? 0,
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

    if (saved.assigneeId) {
      await this.sendAssignmentEmail(saved, saved.assigneeId, reporterId, project.name);
    }

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

  async findRecurrence(issueKey: string): Promise<IssueEntity[]> {
    const issue = await this.findByKey(issueKey);
    const em = await this.tenantConnections.getEntityManager();
    const rootId = issue.recurrenceParentId ?? issue.id;

    return em.getRepository(IssueEntity).find({
      where: [{ id: rootId }, { recurrenceParentId: rootId }],
      order: { recurrenceOccurrence: 'ASC', createdAt: 'ASC' },
    });
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
      if (filters.statusId)
        qb.andWhere('issue.statusId = :statusId', { statusId: filters.statusId });
      if (filters.assigneeId)
        qb.andWhere('issue.assigneeId = :assigneeId', { assigneeId: filters.assigneeId });
      if (filters.priority)
        qb.andWhere('issue.priority = :priority', { priority: filters.priority });
      if (filters.issueTypeId)
        qb.andWhere('issue.issueTypeId = :issueTypeId', { issueTypeId: filters.issueTypeId });
      if (filters.startDateFrom)
        qb.andWhere('issue.startDate >= :startDateFrom', { startDateFrom: filters.startDateFrom });
      if (filters.startDateTo)
        qb.andWhere('issue.startDate <= :startDateTo', { startDateTo: filters.startDateTo });
      if (filters.dueDateFrom)
        qb.andWhere('issue.dueDate >= :dueDateFrom', { dueDateFrom: filters.dueDateFrom });
      if (filters.dueDateTo)
        qb.andWhere('issue.dueDate <= :dueDateTo', { dueDateTo: filters.dueDateTo });
    }

    if (!params.sort) {
      qb.orderBy('issue.sortOrder', 'ASC').addOrderBy('issue.createdAt', 'ASC');
    }

    return paginate(qb, params, [
      'summary',
      'priority',
      'createdAt',
      'updatedAt',
      'key',
      'sortOrder',
      'startDate',
      'dueDate',
      'percentDone',
      'storyPoints',
    ]);
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

  async findBacklog(
    projectKey: string,
    params: PaginationParams,
    filters: Pick<IssueFilters, 'priority' | 'assigneeId' | 'issueTypeId'> = {},
  ): Promise<PaginatedResponse<IssueEntity>> {
    const project = await this.projectsService.findByKey(projectKey);
    const em = await this.tenantConnections.getEntityManager();
    const qb = em
      .getRepository(IssueEntity)
      .createQueryBuilder('issue')
      .leftJoinAndSelect('issue.issueType', 'issueType')
      .where('issue.projectId = :projectId', { projectId: project.id })
      .andWhere('issue.sprintId IS NULL')
      .orderBy('issue.sortOrder', 'ASC')
      .addOrderBy('issue.createdAt', 'ASC');

    if (filters.priority) {
      qb.andWhere('issue.priority = :priority', { priority: filters.priority });
    }
    if (filters.assigneeId === 'unassigned') {
      qb.andWhere('issue.assigneeId IS NULL');
    } else if (filters.assigneeId) {
      qb.andWhere('issue.assigneeId = :assigneeId', { assigneeId: filters.assigneeId });
    }
    if (filters.issueTypeId) {
      qb.andWhere('issue.issueTypeId = :issueTypeId', { issueTypeId: filters.issueTypeId });
    }

    return paginate(qb, params, ['sortOrder', 'priority', 'createdAt', 'updatedAt']);
  }

  async update(issueKey: string, dto: UpdateIssueDto, userId?: string, appendToSprint = false): Promise<IssueEntity> {
    if (dto.customFields !== undefined) {
      await this.customFieldsService.validateCustomFields(dto.customFields);
    }
    const changedFields: Record<string, unknown> = {};
    for (const key of Object.keys(dto) as (keyof UpdateIssueDto)[]) {
      if (dto[key] !== undefined) {
        changedFields[key] = dto[key];
      }
    }
    const { tenantId } = requireTenantContext();
    const result = await this.tenantConnections.runInTenantTransaction(async (em) => {
      const repo = em.getRepository(IssueEntity);
      const issue = await repo.findOne({
        where: { key: issueKey },
        lock: { mode: 'pessimistic_write' },
      });
      if (!issue) {
        throw new NotFoundException(`Issue "${issueKey}" not found`);
      }

      const previous = {
        assigneeId: issue.assigneeId,
        statusId: issue.statusId,
        sprintId: issue.sprintId,
        priority: issue.priority,
        startDate: issue.startDate,
        dueDate: issue.dueDate,
        summary: issue.summary,
        percentDone: issue.percentDone,
        storyPoints: issue.storyPoints,
      };

      if (dto.parentId !== undefined) {
        await this.assertValidHierarchyTarget(
          em,
          issue.id,
          issue.projectId,
          dto.parentId ?? null,
          'parent',
        );
      }
      if (dto.epicId !== undefined) {
        await this.assertValidHierarchyTarget(
          em,
          issue.id,
          issue.projectId,
          dto.epicId ?? null,
          'epic',
        );
      }

      if (dto.statusId !== undefined && dto.statusId !== issue.statusId) {
        if (!userId) {
          throw new BadRequestException('A user is required to transition an issue');
        }
        await this.performTransitionInManager(
          em,
          issue,
          userId,
          tenantId,
          { statusId: dto.statusId },
        );
      }

      if (dto.assigneeId !== undefined) issue.assigneeId = dto.assigneeId ?? null;
      if (dto.parentId !== undefined) issue.parentId = dto.parentId ?? null;
      if (dto.epicId !== undefined) issue.epicId = dto.epicId ?? null;
      if (dto.sprintId !== undefined) {
        await this.assertValidSprint(em, issue.projectId, dto.sprintId ?? null);
        issue.sprintId = dto.sprintId ?? null;
        if (appendToSprint && dto.sortOrder === undefined && issue.sprintId !== previous.sprintId) {
          const order = repo.createQueryBuilder('candidate')
            .select('COALESCE(MAX(candidate.sortOrder), 0)', 'max')
            .where('candidate.projectId = :projectId', { projectId: issue.projectId })
            .andWhere('candidate.id != :issueId', { issueId: issue.id });
          if (issue.sprintId) order.andWhere('candidate.sprintId = :sprintId', { sprintId: issue.sprintId });
          else order.andWhere('candidate.sprintId IS NULL');
          issue.sortOrder = Number((await order.getRawOne())?.max ?? 0) + 1000;
        }
      }
      if (dto.summary !== undefined) issue.summary = dto.summary;
      if (dto.description !== undefined) issue.description = dto.description;
      if (dto.priority !== undefined) issue.priority = dto.priority;
      if (dto.labels !== undefined) issue.labels = dto.labels;
      if (dto.customFields !== undefined) issue.customFields = dto.customFields;
      if (dto.sortOrder !== undefined) issue.sortOrder = dto.sortOrder;
      if (dto.startDate !== undefined) issue.startDate = dto.startDate ?? null;
      if (dto.dueDate !== undefined) issue.dueDate = dto.dueDate ?? null;
      if (dto.percentDone !== undefined) issue.percentDone = dto.percentDone;
      if (dto.storyPoints !== undefined) issue.storyPoints = dto.storyPoints;
      if (dto.recurrenceRule !== undefined) issue.recurrenceRule = dto.recurrenceRule;

      const saved = await repo.save(issue);
      if (userId) {
        await this.logTrackedUpdateActivity(em, saved, dto, previous, userId);
      }
      return { issue: saved, previous };
    });

    const projectKey = issueKey.split('-')[0];
    await this.eventDispatcher.emit('issue.updated', {
      issueKey,
      projectKey,
      fields: changedFields,
      userId: userId ?? null,
    });

    if (
      dto.assigneeId !== undefined &&
      dto.assigneeId !== result.previous.assigneeId
    ) {
      await this.eventDispatcher.emit('issue.assigned', {
        issueKey,
        projectKey,
        assigneeId: result.issue.assigneeId,
        previousAssigneeId: result.previous.assigneeId,
        userId: userId ?? null,
      });

      if (result.issue.assigneeId) {
        const project = await this.projectsService.findByKey(issueKey.split('-')[0]);
        await this.sendAssignmentEmail(result.issue, result.issue.assigneeId, userId ?? null, project.name);
      }
    }

    const statusChanged = result.issue.statusId !== result.previous.statusId;
    const sprintChanged = result.issue.sprintId !== result.previous.sprintId;
    if (sprintChanged) {
      await this.eventDispatcher.emit('issue.sprint_changed', { issueKey, projectKey, fromSprint: result.previous.sprintId, toSprint: result.issue.sprintId, sortOrder: result.issue.sortOrder, userId });
    }
    if (statusChanged) {
      await this.eventDispatcher.emit('issue.status_changed', {
        issueKey,
        projectKey,
        fromStatus: result.previous.statusId,
        toStatus: result.issue.statusId,
        userId,
      });
    }
    if (statusChanged || sprintChanged) {
      await this.eventDispatcher.emit('issue.moved', {
        issueKey,
        projectKey,
        fromStatus: result.previous.statusId,
        toStatus: result.issue.statusId,
        fromSprint: result.previous.sprintId ?? null,
        toSprint: result.issue.sprintId ?? null,
        userId: userId ?? null,
      });
    }

    if (statusChanged) {
      const em = await this.tenantConnections.getEntityManager();
      const [oldStatus, newStatus, project] = await Promise.all([
        this.resolveStatusName(em, result.previous.statusId),
        this.resolveStatusName(em, result.issue.statusId),
        this.projectsService.findByKey(projectKey),
      ]);
      await this.sendStatusChangeEmails(result.issue, oldStatus ?? result.previous.statusId, newStatus ?? result.issue.statusId, userId ?? null, project.name);
    }
    return result.issue;
  }

  async bulkUpdate(
    issueIds: string[],
    updates: BulkIssueUpdatesDto,
    userId: string,
  ): Promise<IssueEntity[]> {
    this.validateBulkRequest(issueIds, updates);
    const uniqueIssueIds = [...new Set(issueIds)];
    const { tenantId } = requireTenantContext();

    const updatedIssues = await this.tenantConnections.runInTenantTransaction(async (manager) => {
      const issueRepo = manager.getRepository(IssueEntity);
      const issues = await issueRepo.find({ where: { id: In(uniqueIssueIds) }, lock: { mode: 'pessimistic_write' } });
      if (issues.length !== uniqueIssueIds.length) {
        throw new NotFoundException('One or more issues were not found');
      }

      const previousValues = new Map(
        issues.map((issue) => [
          issue.id,
          {
            statusId: issue.statusId,
            assigneeId: issue.assigneeId,
            priority: issue.priority,
            sprintId: issue.sprintId,
            labels: [...issue.labels],
          },
        ]),
      );

      for (const issue of issues) {
        if (updates.statusId !== undefined && updates.statusId !== issue.statusId) {
          await this.performTransitionInManager(manager, issue, userId, tenantId, { statusId: updates.statusId });
        }
        if (updates.assigneeId !== undefined) issue.assigneeId = updates.assigneeId;
        if (updates.priority !== undefined) issue.priority = updates.priority;
        if (updates.sprintId !== undefined) {
          await this.assertValidSprint(manager, issue.projectId, updates.sprintId);
          issue.sprintId = updates.sprintId;
        }
        if (updates.labels !== undefined) issue.labels = [...updates.labels];
      }

      const savedIssues = await issueRepo.save(issues);
      const activityEntries = await this.buildBulkActivityEntries(
        manager,
        savedIssues,
        previousValues,
        { ...updates, statusId: undefined },
        userId,
      );
      if (activityEntries.length > 0) {
        await manager.getRepository(ActivityLogEntity).save(activityEntries);
      }

      return savedIssues;
    });

    await this.emitBulkEvent('issue.bulk_updated', updatedIssues, { updates, userId });

    return updatedIssues;
  }

  async bulkDelete(issueIds: string[], userId: string): Promise<{ count: number }> {
    this.validateBulkRequest(issueIds);
    const uniqueIssueIds = [...new Set(issueIds)];
    const em = await this.tenantConnections.getEntityManager();

    const deleted = await em.transaction(async (manager) => {
      const issueRepo = manager.getRepository(IssueEntity);
      const issues = await issueRepo.find({ where: { id: In(uniqueIssueIds) } });
      if (issues.length !== uniqueIssueIds.length) {
        throw new NotFoundException('One or more issues were not found');
      }

      const attachments = await manager.getRepository(AttachmentEntity).find({
        where: { issueId: In(uniqueIssueIds) },
        select: ['storageKey'],
      });

      await manager
        .getRepository(IssueLinkEntity)
        .createQueryBuilder()
        .delete()
        .where('source_issue_id IN (:...issueIds)', { issueIds: uniqueIssueIds })
        .orWhere('target_issue_id IN (:...issueIds)', { issueIds: uniqueIssueIds })
        .execute();
      await manager.getRepository(CommentEntity).delete({ issueId: In(uniqueIssueIds) });
      await manager.getRepository(TimeEntryEntity).delete({ issueId: In(uniqueIssueIds) });
      await manager.getRepository(ActivityLogEntity).delete({ issueId: In(uniqueIssueIds) });
      await manager.getRepository(AttachmentEntity).delete({ issueId: In(uniqueIssueIds) });

      await issueRepo.update({ parentId: In(uniqueIssueIds) }, { parentId: null });
      await issueRepo.update({ epicId: In(uniqueIssueIds) }, { epicId: null });
      await issueRepo.delete({ id: In(uniqueIssueIds) });

      return {
        issues,
        attachmentStorageKeys: attachments.map((attachment) => attachment.storageKey),
      };
    });

    await this.deleteAttachmentFiles(deleted.attachmentStorageKeys);
    await this.emitBulkEvent('issue.bulk_deleted', deleted.issues, { userId });

    return { count: deleted.issues.length };
  }

  private async emitBulkEvent(event: string, issues: IssueEntity[], payload: Record<string, unknown>): Promise<void> {
    const groups = new Map<string, IssueEntity[]>();
    for (const issue of issues) {
      const key = issue.key.split('-')[0];
      groups.set(key, [...(groups.get(key) ?? []), issue]);
    }
    for (const [projectKey, scoped] of groups) {
      await this.eventDispatcher.emit(event, {
        ...payload, projectKey, projectKeys: [projectKey],
        issueIds: scoped.map((issue) => issue.id), issueKeys: scoped.map((issue) => issue.key), count: scoped.length,
      });
    }
  }

  private validateBulkRequest(issueIds: string[], updates?: BulkIssueUpdatesDto): void {
    if (issueIds.length === 0) {
      throw new BadRequestException('At least one issue is required');
    }
    if (issueIds.length > 100) {
      throw new BadRequestException('Bulk operations are limited to 100 issues');
    }
    if (updates && Object.keys(updates).length === 0) {
      throw new BadRequestException('At least one bulk update field is required');
    }
  }

  private async buildBulkActivityEntries(
    manager: EntityManager,
    issues: IssueEntity[],
    previousValues: Map<
      string,
      {
        statusId: string;
        assigneeId: string | null;
        priority: string;
        sprintId: string | null;
        labels: string[];
      }
    >,
    updates: BulkIssueUpdatesDto,
    userId: string,
  ): Promise<ActivityLogEntity[]> {
    const statusIds = new Set<string>();
    const sprintIds = new Set<string>();
    const assigneeIds = new Set<string>();

    for (const previous of previousValues.values()) {
      if (previous.statusId) statusIds.add(previous.statusId);
      if (previous.sprintId) sprintIds.add(previous.sprintId);
      if (previous.assigneeId) assigneeIds.add(previous.assigneeId);
    }
    if (updates.statusId) statusIds.add(updates.statusId);
    if (updates.sprintId) sprintIds.add(updates.sprintId);
    if (updates.assigneeId) assigneeIds.add(updates.assigneeId);

    const [statuses, sprints, users] = await Promise.all([
      statusIds.size > 0
        ? manager.getRepository(WorkflowStatusEntity).find({ where: { id: In([...statusIds]) } })
        : [],
      sprintIds.size > 0
        ? manager.getRepository(SprintEntity).find({ where: { id: In([...sprintIds]) } })
        : [],
      assigneeIds.size > 0 ? this.userRepo.find({ where: { id: In([...assigneeIds]) } }) : [],
    ]);
    const statusNames = new Map<string, string>(statuses.map((status) => [status.id, status.name]));
    const sprintNames = new Map<string, string>(sprints.map((sprint) => [sprint.id, sprint.name]));
    const userNames = new Map<string, string>(
      users.map((user) => [user.id, user.displayName || user.email || user.id]),
    );
    const activityRepo = manager.getRepository(ActivityLogEntity);
    const entries: ActivityLogEntity[] = [];

    const addEntry = (
      issue: IssueEntity,
      fieldName: string,
      oldValue: string | null,
      newValue: string | null,
    ) => {
      if (oldValue === newValue) return;
      entries.push(
        activityRepo.create({
          issueId: issue.id,
          userId,
          action: 'bulk_updated',
          fieldName,
          oldValue,
          newValue,
        }),
      );
    };

    for (const issue of issues) {
      const previous = previousValues.get(issue.id)!;
      if (updates.statusId !== undefined) {
        addEntry(
          issue,
          'status',
          statusNames.get(previous.statusId) ?? previous.statusId,
          statusNames.get(issue.statusId) ?? issue.statusId,
        );
      }
      if (updates.assigneeId !== undefined) {
        addEntry(
          issue,
          'assignee',
          previous.assigneeId ? (userNames.get(previous.assigneeId) ?? previous.assigneeId) : null,
          issue.assigneeId ? (userNames.get(issue.assigneeId) ?? issue.assigneeId) : null,
        );
      }
      if (updates.priority !== undefined) {
        addEntry(issue, 'priority', previous.priority, issue.priority);
      }
      if (updates.sprintId !== undefined) {
        addEntry(
          issue,
          'sprint',
          previous.sprintId ? (sprintNames.get(previous.sprintId) ?? previous.sprintId) : null,
          issue.sprintId ? (sprintNames.get(issue.sprintId) ?? issue.sprintId) : null,
        );
      }
      if (updates.labels !== undefined) {
        addEntry(
          issue,
          'labels',
          previous.labels.length > 0 ? previous.labels.join(', ') : null,
          issue.labels.length > 0 ? issue.labels.join(', ') : null,
        );
      }
    }

    return entries;
  }

  private async deleteAttachmentFiles(storageKeys: string[]): Promise<void> {
    await Promise.all(
      storageKeys.map(async (storageKey) => {
        try {
          await this.storage.delete(storageKey);
        } catch (error: any) {
          if (error?.code !== 'ENOENT') {
            this.logger.warn(`Failed to delete attachment file ${storageKey}: ${error}`);
          }
        }
      }),
    );
  }

  async moveToSprint(issueKey: string, dto: MoveIssueSprintDto, userId: string): Promise<IssueEntity> {
    return this.update(issueKey, dto, userId, true);
  }

  private async assertValidSprint(em: EntityManager, projectId: string, sprintId: string | null): Promise<void> {
    if (!sprintId) return;
    const sprint = await em.getRepository(SprintEntity).findOne({ where: { id: sprintId }, lock: { mode: 'pessimistic_write' } });
    if (!sprint || sprint.projectId !== projectId) throw new BadRequestException('Issue and sprint must belong to the same project');
    if (sprint.status === 'completed') throw new BadRequestException('Issues cannot be added to a completed sprint');
  }

  async addLabel(issueKey: string, label: string, userId?: string): Promise<IssueEntity> {
    await this.findByKey(issueKey);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(IssueEntity);
    const result = await repo
      .createQueryBuilder()
      .update(IssueEntity)
      .set({ labels: () => 'array_append("labels", :label)' })
      .where('"key" = :issueKey', { issueKey })
      .andWhere('NOT (:label = ANY("labels"))', { label })
      .execute();
    const saved = await this.findByKey(issueKey);

    if (result.affected) {
      await this.eventDispatcher.emit('issue.updated', {
        issueKey,
        projectKey: issueKey.split('-')[0],
        fields: { labels: saved.labels },
        userId: userId ?? null,
      });
    }

    return saved;
  }

  async reorder(dto: ReorderIssuesDto, userId: string): Promise<void> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(IssueEntity);

    const ids = [...new Set(dto.issues.map((i) => i.id))];
    const issues = await repo.find({
      where: { id: In(ids) },
      relations: ['project'],
    });

    if (issues.length !== ids.length) {
      throw new NotFoundException('One or more issues not found');
    }

    const projectIds = new Set(issues.map((issue) => issue.projectId));
    if (projectIds.size !== 1) {
      throw new BadRequestException('All reordered issues must belong to one project');
    }

    const orderMap = new Map(dto.issues.map((i) => [i.id, i.sortOrder]));
    for (const issue of issues) {
      issue.sortOrder = orderMap.get(issue.id)!;
    }

    await repo.save(issues);

    this.eventDispatcher.emit('issue.reordered', {
      projectKey: issues[0].project.key,
      issueKeys: issues.map((issue) => issue.key),
      userId,
    });
  }

  async transition(issueKey: string, transitionId: string, userId: string): Promise<IssueEntity> {
    return this.performTransition(issueKey, userId, { transitionId });
  }

  private async performTransition(
    issueKey: string,
    userId: string,
    selector: { transitionId: string } | { statusId: string },
  ): Promise<IssueEntity> {
    const { tenantId } = requireTenantContext();
    const result = await this.tenantConnections.runInTenantTransaction(
      async (em) => {
        const issueRepo = em.getRepository(IssueEntity);
        const issue = await issueRepo.findOne({
          where: { key: issueKey },
          lock: { mode: 'pessimistic_write' },
        });
        if (!issue) {
          throw new NotFoundException(`Issue "${issueKey}" not found`);
        }
        return this.performTransitionInManager(
          em,
          issue,
          userId,
          tenantId,
          selector,
        );
      },
    );

    const event = {
      issueKey,
      projectKey: issueKey.split('-')[0],
      fromStatus: result.oldStatusId,
      toStatus: result.issue.statusId,
      userId,
    };
    await this.eventDispatcher.emit('issue.status_changed', event);
    await this.eventDispatcher.emit('issue.moved', event);
    await this.eventDispatcher.emit('issue.updated', { ...event, fields: { statusId: result.issue.statusId } });
    const em = await this.tenantConnections.getEntityManager();
    const [oldStatus, newStatus, project] = await Promise.all([
      this.resolveStatusName(em, result.oldStatusId),
      this.resolveStatusName(em, result.issue.statusId),
      this.projectsService.findByKey(event.projectKey),
    ]);
    await this.sendStatusChangeEmails(result.issue, oldStatus ?? result.oldStatusId, newStatus ?? result.issue.statusId, userId, project.name);
    return result.issue;
  }

  private async performTransitionInManager(
    em: EntityManager,
    issue: IssueEntity,
    userId: string,
    tenantId: string,
    selector: { transitionId: string } | { statusId: string },
  ): Promise<{ issue: IssueEntity; oldStatusId: string }> {
    const project = await em
      .getRepository(ProjectEntity)
      .findOneBy({ id: issue.projectId });
    if (!project) {
      throw new NotFoundException('Issue project not found');
    }
    const workflowId =
      project.workflowId ??
      (await em.getRepository(WorkflowEntity).findOneBy({ isDefault: true }))?.id;
    if (!workflowId) {
      throw new BadRequestException('Issue has no workflow');
    }

    const transition = await em.getRepository(WorkflowTransitionEntity).findOne({
      where:
        'transitionId' in selector
          ? { id: selector.transitionId, workflowId }
          : {
              workflowId,
              fromStatusId: issue.statusId,
              toStatusId: selector.statusId,
            },
      relations: ['toStatus'],
    });
    if (!transition || transition.fromStatusId !== issue.statusId) {
      throw new BadRequestException(
        'Transition is not valid for the issue workflow and current status',
      );
    }

    const conditionContext = {
      userId,
      issueId: issue.id,
      tenantId,
      currentStatusId: issue.statusId,
      targetStatusId: transition.toStatusId,
      issueData: { ...issue },
    };
    const conditions = this.parseTransitionRules(transition.conditions, 'condition');
    const validators = this.parseTransitionRules(transition.validators, 'validator');
    try {
      if (!(await this.conditionEvaluators.evaluateAll(conditions, conditionContext))) {
        throw new BadRequestException('Transition conditions were not met');
      }
      if (!(await this.conditionEvaluators.evaluateAll(validators, conditionContext))) {
        throw new BadRequestException('Transition validation failed');
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException((error as Error).message);
    }

    const oldStatusId = issue.statusId;
    issue.statusId = transition.toStatusId;
    const saved = await em.getRepository(IssueEntity).save(issue);
    await this.logTransitionActivity(
      em,
      saved,
      userId,
      oldStatusId,
      transition.toStatusId,
    );

    const postFunctions = this.parseTransitionRules(
      transition.postFunctions,
      'post-function',
    );
    try {
      await this.postFunctions.executeAll(postFunctions, {
        userId,
        issueId: saved.id,
        tenantId,
        fromStatusId: oldStatusId,
        toStatusId: transition.toStatusId,
        issueData: { ...saved },
      });
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }

    if (postFunctions.length > 0) {
      Object.assign(saved, await em.getRepository(IssueEntity).findOneByOrFail({ id: saved.id }));
    }
    return { issue: saved, oldStatusId };
  }

  private parseTransitionRules(
    value: unknown,
    label: string,
  ): Array<{ type: string; params: Record<string, unknown> }> {
    if (!Array.isArray(value)) {
      throw new BadRequestException(`Transition ${label} configuration is invalid`);
    }

    return value.map((rule) => {
      if (
        typeof rule !== 'object' ||
        rule === null ||
        typeof (rule as Record<string, unknown>).type !== 'string'
      ) {
        throw new BadRequestException(
          `Transition ${label} configuration is invalid`,
        );
      }
      const { type, params, ...flatParams } = rule as Record<string, unknown>;
      return {
        type: type as string,
        params:
          typeof params === 'object' && params !== null && !Array.isArray(params)
            ? (params as Record<string, unknown>)
            : flatParams,
      };
    });
  }

  private async assertValidHierarchyTarget(
    em: EntityManager,
    issueId: string | null,
    projectId: string,
    targetId: string | null,
    label: string,
  ): Promise<void> {
    if (!targetId) return;
    if (targetId === issueId) {
      throw new BadRequestException(`An issue cannot be its own ${label}`);
    }

    const pending: Array<{ id: string; path: Set<string> }> = [
      { id: targetId, path: new Set() },
    ];
    while (pending.length > 0) {
      const { id: currentId, path } = pending.pop()!;
      if (currentId === issueId) {
        throw new BadRequestException(`The selected ${label} creates a hierarchy cycle`);
      }
      if (path.has(currentId)) {
        throw new BadRequestException('The selected hierarchy already contains a cycle');
      }
      const nextPath = new Set(path);
      nextPath.add(currentId);

      const current = await em.getRepository(IssueEntity).findOneBy({ id: currentId });
      if (!current || current.projectId !== projectId) {
        throw new BadRequestException(
          `The selected ${label} must be an issue in the same project`,
        );
      }
      if (current.parentId) pending.push({ id: current.parentId, path: nextPath });
      if (current.epicId) pending.push({ id: current.epicId, path: nextPath });
    }
  }

  private async logTrackedUpdateActivity(
    em: EntityManager,
    issue: IssueEntity,
    dto: UpdateIssueDto,
    previous: {
      assigneeId: string | null;
      statusId: string;
      sprintId: string | null;
      priority: string;
      startDate: string | null;
      dueDate: string | null;
      summary: string;
      percentDone: number;
      storyPoints: number | null;
    },
    userId: string,
  ): Promise<void> {
    const trackedChanges: Array<{
      field: string;
      oldVal: string | null;
      newVal: string | null;
    }> = [];

    if (dto.assigneeId !== undefined && issue.assigneeId !== previous.assigneeId) {
      const [oldName, newName] = await Promise.all([
        this.resolveUserName(previous.assigneeId),
        this.resolveUserName(issue.assigneeId),
      ]);
      trackedChanges.push({ field: 'assignee', oldVal: oldName, newVal: newName });
    }
    if (dto.sprintId !== undefined && issue.sprintId !== previous.sprintId) {
      const [oldName, newName] = await Promise.all([
        this.resolveSprintName(em, previous.sprintId),
        this.resolveSprintName(em, issue.sprintId),
      ]);
      trackedChanges.push({ field: 'sprint', oldVal: oldName, newVal: newName });
    }
    if (dto.priority !== undefined && issue.priority !== previous.priority) {
      trackedChanges.push({
        field: 'priority',
        oldVal: previous.priority,
        newVal: issue.priority,
      });
    }
    if (dto.startDate !== undefined && issue.startDate !== previous.startDate) {
      trackedChanges.push({
        field: 'startDate',
        oldVal: previous.startDate,
        newVal: issue.startDate,
      });
    }
    if (dto.dueDate !== undefined && issue.dueDate !== previous.dueDate) {
      trackedChanges.push({
        field: 'dueDate',
        oldVal: previous.dueDate,
        newVal: issue.dueDate,
      });
    }
    if (dto.summary !== undefined && issue.summary !== previous.summary) {
      trackedChanges.push({
        field: 'summary',
        oldVal: previous.summary,
        newVal: issue.summary,
      });
    }
    if (dto.percentDone !== undefined && issue.percentDone !== previous.percentDone) {
      trackedChanges.push({
        field: 'percentDone',
        oldVal: String(previous.percentDone),
        newVal: String(issue.percentDone),
      });
    }
    if (dto.storyPoints !== undefined && issue.storyPoints !== previous.storyPoints) {
      trackedChanges.push({ field: 'storyPoints', oldVal: previous.storyPoints === null ? null : String(previous.storyPoints), newVal: issue.storyPoints === null ? null : String(issue.storyPoints) });
    }

    if (trackedChanges.length === 0) return;
    const activityRepo = em.getRepository(ActivityLogEntity);
    await activityRepo.save(
      trackedChanges.map((change) => activityRepo.create({
        issueId: issue.id,
        userId,
        action: 'updated',
        fieldName: change.field,
        oldValue: change.oldVal,
        newValue: change.newVal,
      })),
    );
  }

  private async logTransitionActivity(
    em: EntityManager,
    issue: IssueEntity,
    userId: string,
    oldStatusId: string,
    newStatusId: string,
  ): Promise<void> {
    const [oldStatusName, newStatusName] = await Promise.all([
      this.resolveStatusName(em, oldStatusId),
      this.resolveStatusName(em, newStatusId),
    ]);
    const activityRepo = em.getRepository(ActivityLogEntity);
    await activityRepo.save(
      activityRepo.create({
        issueId: issue.id,
        userId,
        action: 'transitioned',
        fieldName: 'status',
        oldValue: oldStatusName,
        newValue: newStatusName,
      }),
    );
  }

  async delete(issueKey: string, userId: string): Promise<void> {
    const issue = await this.findByKey(issueKey);
    const attachments = await this.tenantConnections.runInTenantTransaction(
      async (manager) => {
        const attachmentRepo = manager.getRepository(AttachmentEntity);
        const issueAttachments = await attachmentRepo.findBy({ issueId: issue.id });

        await manager.getRepository(IssueEntity).update(
          { parentId: issue.id },
          { parentId: null },
        );
        await manager.getRepository(IssueEntity).update(
          { epicId: issue.id },
          { epicId: null },
        );
        await manager
          .getRepository(IssueLinkEntity)
          .createQueryBuilder()
          .delete()
          .where('source_issue_id = :issueId OR target_issue_id = :issueId', {
            issueId: issue.id,
          })
          .execute();
        await manager.getRepository(CommentEntity).delete({ issueId: issue.id });
        await manager.getRepository(ActivityLogEntity).delete({ issueId: issue.id });
        await manager.getRepository(TimeEntryEntity).delete({ issueId: issue.id });
        await attachmentRepo.delete({ issueId: issue.id });
        await manager.getRepository(IssueEntity).delete({ id: issue.id });

        return issueAttachments;
      },
    );

    for (const attachment of attachments) {
      try {
        await this.storage.delete(attachment.storageKey);
      } catch {
        // The database deletion is authoritative; missing legacy objects are ignored.
      }
    }

    this.eventDispatcher.emit('issue.deleted', {
      issueKey,
      projectKey: issueKey.split('-')[0],
      userId,
    });
  }

  private async sendAssignmentEmail(
    issue: IssueEntity,
    assigneeId: string,
    actorId: string | null,
    projectName: string,
  ): Promise<void> {
    const tenantId = getTenantContext()?.tenantId;
    if (!tenantId) return;

    try {
      await this.mailService.enqueueNotification({
        tenantId,
        userId: assigneeId,
        preference: 'emailOnAssign',
        template: 'issue-assigned',
        context: {
          actorName: (await this.resolveUserName(actorId)) ?? 'Someone',
          issueKey: issue.key,
          issueSummary: issue.summary,
          projectName,
          issueUrl: this.mailService.issueUrl(issue.key),
        },
      });
    } catch (error) {
      this.logger.warn(`Unable to prepare assignment email for ${issue.key}: ${String(error)}`);
    }
  }

  private async sendStatusChangeEmails(
    issue: IssueEntity,
    oldStatus: string,
    newStatus: string,
    actorId: string | null,
    projectName: string,
  ): Promise<void> {
    const tenantId = getTenantContext()?.tenantId;
    if (!tenantId) return;

    const recipients = [
      ...new Set([issue.assigneeId, issue.reporterId].filter(Boolean)),
    ] as string[];
    if (recipients.length === 0) return;

    try {
      const actorName = (await this.resolveUserName(actorId)) ?? 'Someone';
      await Promise.all(
        recipients.map((userId) =>
          this.mailService.enqueueNotification({
            tenantId,
            userId,
            preference: 'emailOnStatusChange',
            template: 'issue-status-changed',
            context: {
              actorName,
              issueKey: issue.key,
              issueSummary: issue.summary,
              projectName,
              oldStatus,
              newStatus,
              issueUrl: this.mailService.issueUrl(issue.key),
            },
          }),
        ),
      );
    } catch (error) {
      this.logger.warn(`Unable to prepare status email for ${issue.key}: ${String(error)}`);
    }
  }
}
