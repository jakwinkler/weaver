import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
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
  UpdateIssueDto,
  ReorderIssuesDto,
  PaginatedResponse,
} from '@weaver/shared';
import { EntityManager, Repository, In } from 'typeorm';
import { promises as fs } from 'fs';
import * as path from 'path';
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
  private readonly logger = new Logger(IssuesService.name);

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

    return paginate(qb, params, ['summary', 'priority', 'createdAt', 'updatedAt', 'key', 'sortOrder', 'startDate', 'dueDate', 'percentDone']);
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
