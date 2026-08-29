import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  ActivityLogEntity,
  AttachmentEntity,
  CommentEntity,
  IssueEntity,
  IssueLinkEntity,
  SprintEntity,
  TimeEntryEntity,
  WorkflowStatusEntity,
} from '@weaver/db';
import { UserEntity } from '@weaver/db';
import {
  BulkIssueUpdatesDto,
  CreateIssueDto,
  MoveIssueSprintDto,
  UpdateIssueDto,
  ReorderIssuesDto,
  PaginatedResponse,
  RoadmapEpic,
  RoadmapStatus,
} from '@weaver/shared';
import { EntityManager, Repository, In } from 'typeorm';
import { promises as fs } from 'fs';
import * as path from 'path';
import { TenantConnectionProvider, requireTenantContext } from '../../core/tenant';
import { ProjectsService } from '../projects';
import { ConditionEvaluatorRegistry, PostFunctionRegistry, WorkflowsService } from '../workflows';
import { EventDispatcherService } from '../events';
import { PaginationParams, paginate } from '../../common';
import { getTenantContext } from '../../core/tenant';
import { MailService } from '../mail';

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
    private readonly conditionRegistry: ConditionEvaluatorRegistry,
    private readonly postFunctionRegistry: PostFunctionRegistry,
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
    const workflowId = project.workflowId || (await this.workflowsService.getDefaultWorkflow()).id;

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
      sortOrder: (counter - 1) * 1000,
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
        trackedChanges.push({
          field: 'startDate',
          oldVal: previousStartDate ?? null,
          newVal: dto.startDate ?? null,
        });
      }
      if (dto.dueDate !== undefined && (dto.dueDate ?? null) !== (previousDueDate ?? null)) {
        trackedChanges.push({
          field: 'dueDate',
          oldVal: previousDueDate ?? null,
          newVal: dto.dueDate ?? null,
        });
      }
      if (dto.summary !== undefined && dto.summary !== previousSummary) {
        trackedChanges.push({ field: 'summary', oldVal: previousSummary, newVal: dto.summary });
      }
      if (dto.percentDone !== undefined && dto.percentDone !== previousPercentDone) {
        trackedChanges.push({
          field: 'percentDone',
          oldVal: String(previousPercentDone),
          newVal: String(dto.percentDone),
        });
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

      if (saved.assigneeId) {
        const project = await this.projectsService.findByKey(issueKey.split('-')[0]);
        await this.sendAssignmentEmail(saved, saved.assigneeId, userId ?? null, project.name);
      }
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

    if (statusChanged) {
      const [oldStatus, newStatus, project] = await Promise.all([
        this.resolveStatusName(em, previousStatusId),
        this.resolveStatusName(em, saved.statusId),
        this.projectsService.findByKey(issueKey.split('-')[0]),
      ]);
      await this.sendStatusChangeEmails(
        saved,
        oldStatus ?? previousStatusId,
        newStatus ?? saved.statusId,
        userId ?? null,
        project.name,
      );
    }

    return saved;
  }

  async bulkUpdate(
    issueIds: string[],
    updates: BulkIssueUpdatesDto,
    userId: string,
  ): Promise<IssueEntity[]> {
    this.validateBulkRequest(issueIds, updates);
    const uniqueIssueIds = [...new Set(issueIds)];
    const em = await this.tenantConnections.getEntityManager();

    const updatedIssues = await em.transaction(async (manager) => {
      const issueRepo = manager.getRepository(IssueEntity);
      const issues = await issueRepo.find({ where: { id: In(uniqueIssueIds) } });
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
        if (updates.statusId !== undefined) issue.statusId = updates.statusId;
        if (updates.assigneeId !== undefined) issue.assigneeId = updates.assigneeId;
        if (updates.priority !== undefined) issue.priority = updates.priority;
        if (updates.sprintId !== undefined) issue.sprintId = updates.sprintId;
        if (updates.labels !== undefined) issue.labels = [...updates.labels];
      }

      const savedIssues = await issueRepo.save(issues);
      const activityEntries = await this.buildBulkActivityEntries(
        manager,
        savedIssues,
        previousValues,
        updates,
        userId,
      );
      if (activityEntries.length > 0) {
        await manager.getRepository(ActivityLogEntity).save(activityEntries);
      }

      return savedIssues;
    });

    await this.eventDispatcher.emit('issue.bulk_updated', {
      issueIds: updatedIssues.map((issue) => issue.id),
      issueKeys: updatedIssues.map((issue) => issue.key),
      projectKeys: [...new Set(updatedIssues.map((issue) => issue.key.split('-')[0]))],
      updates,
      count: updatedIssues.length,
      userId,
    });

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
    await this.eventDispatcher.emit('issue.bulk_deleted', {
      issueIds: deleted.issues.map((issue) => issue.id),
      issueKeys: deleted.issues.map((issue) => issue.key),
      projectKeys: [...new Set(deleted.issues.map((issue) => issue.key.split('-')[0]))],
      count: deleted.issues.length,
      userId,
    });

    return { count: deleted.issues.length };
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
    const uploadDirectory = path.resolve('/tmp/weaver-uploads');
    await Promise.all(
      storageKeys.map(async (storageKey) => {
        const filePath = path.resolve(uploadDirectory, storageKey);
        if (!filePath.startsWith(`${uploadDirectory}${path.sep}`)) {
          this.logger.warn(`Skipped unsafe attachment path: ${storageKey}`);
          return;
        }
        try {
          await fs.unlink(filePath);
        } catch (error: any) {
          if (error?.code !== 'ENOENT') {
            this.logger.warn(`Failed to delete attachment file ${storageKey}: ${error}`);
          }
        }
      }),
    );
  }

  async moveToSprint(
    issueKey: string,
    dto: MoveIssueSprintDto,
    userId: string,
  ): Promise<IssueEntity> {
    const issue = await this.findByKey(issueKey);
    const em = await this.tenantConnections.getEntityManager();
    const issueRepo = em.getRepository(IssueEntity);
    const previousSprintId = issue.sprintId;

    if (dto.sprintId) {
      const sprint = await em.getRepository(SprintEntity).findOneBy({ id: dto.sprintId });
      if (!sprint) {
        throw new NotFoundException(`Sprint "${dto.sprintId}" not found`);
      }
      if (sprint.projectId !== issue.projectId) {
        throw new BadRequestException('Issue and sprint must belong to the same project');
      }
    }

    issue.sprintId = dto.sprintId;
    if (dto.sortOrder !== undefined) {
      issue.sortOrder = dto.sortOrder;
    } else if (dto.sprintId !== previousSprintId) {
      const maxOrderQuery = issueRepo
        .createQueryBuilder('candidate')
        .select('COALESCE(MAX(candidate.sortOrder), 0)', 'max')
        .where('candidate.projectId = :projectId', { projectId: issue.projectId })
        .andWhere('candidate.id != :issueId', { issueId: issue.id });

      if (dto.sprintId) {
        maxOrderQuery.andWhere('candidate.sprintId = :sprintId', { sprintId: dto.sprintId });
      } else {
        maxOrderQuery.andWhere('candidate.sprintId IS NULL');
      }

      const result = await maxOrderQuery.getRawOne<{ max: string | number }>();
      issue.sortOrder = Number(result?.max ?? 0) + 1000;
    }

    const saved = await issueRepo.save(issue);
    if (dto.sprintId === previousSprintId) {
      return saved;
    }

    const [oldName, newName] = await Promise.all([
      this.resolveSprintName(em, previousSprintId),
      this.resolveSprintName(em, dto.sprintId),
    ]);
    const activity = em.getRepository(ActivityLogEntity).create({
      issueId: issue.id,
      userId,
      action: 'updated',
      fieldName: 'sprint',
      oldValue: oldName,
      newValue: newName,
    });
    await em.getRepository(ActivityLogEntity).save(activity);

    const payload = {
      issueKey,
      projectKey: issueKey.split('-')[0],
      fromSprint: previousSprintId,
      toSprint: saved.sprintId,
      sortOrder: saved.sortOrder,
      userId,
    };
    await this.eventDispatcher.emit('issue.sprint_changed', payload);
    await this.eventDispatcher.emit('issue.moved', {
      ...payload,
      fromStatus: saved.statusId,
      toStatus: saved.statusId,
    });

    return saved;
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

    const ids = dto.issues.map((i) => i.id);
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
      throw new BadRequestException(`Transition is not valid from the current status`);
    }

    const transitionContext = {
      userId,
      issueId: issue.id,
      tenantId: requireTenantContext().tenantId,
      currentStatusId: issue.statusId,
      targetStatusId: transition.toStatusId,
      issueData: issue as unknown as Record<string, unknown>,
    };
    try {
      const conditionsPassed = await this.conditionRegistry.evaluateAll(
        transition.conditions as Array<{
          type: string;
          params?: Record<string, unknown>;
          [key: string]: unknown;
        }>,
        transitionContext,
      );
      if (!conditionsPassed) {
        throw new BadRequestException('Workflow transition conditions were not met');
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        `Workflow transition condition failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
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

    await this.postFunctionRegistry.executeAll(
      transition.postFunctions as Array<{
        type: string;
        params?: Record<string, unknown>;
        [key: string]: unknown;
      }>,
      {
        userId,
        issueId: issue.id,
        tenantId: transitionContext.tenantId,
        fromStatusId: oldStatusId,
        toStatusId: transition.toStatusId,
        issueData: saved as unknown as Record<string, unknown>,
      },
    );

    await this.eventDispatcher.emit('issue.updated', {
      issueKey,
      projectKey: issueKey.split('-')[0],
      fields: { statusId: transition.toStatusId },
      userId,
    });

    await this.eventDispatcher.emit('issue.status_changed', {
      issueKey,
      projectKey: issueKey.split('-')[0],
      fromStatus: oldStatusId,
      toStatus: transition.toStatusId,
      userId,
    });

    const project = await this.projectsService.findByKey(issueKey.split('-')[0]);
    await this.sendStatusChangeEmails(
      saved,
      oldStatusName ?? oldStatusId,
      newStatusName ?? transition.toStatusId,
      userId,
      project.name,
    );

    return saved;
  }

  async delete(issueKey: string, userId: string): Promise<void> {
    const issue = await this.findByKey(issueKey);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(IssueEntity);
    await repo.remove(issue);

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
