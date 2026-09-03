import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
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
import { CreateIssueDto, UpdateIssueDto, ReorderIssuesDto, PaginatedResponse } from '@weaver/shared';
import { EntityManager, Repository, In } from 'typeorm';
import { requireTenantContext, TenantConnectionProvider } from '../../core/tenant';
import { ProjectsService } from '../projects';
import { WorkflowsService } from '../workflows';
import { EventDispatcherService } from '../events';
import { PaginationParams, paginate } from '../../common';
import {
  ConditionEvaluatorRegistry,
  PostFunctionRegistry,
} from '../workflows';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { StorageService } from '../../core/storage';

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

  async create(projectKey: string, dto: CreateIssueDto, reporterId: string): Promise<IssueEntity> {
    const project = await this.projectsService.findByKey(projectKey);
    const em = await this.tenantConnections.getEntityManager();

    await this.customFieldsService.validateCustomFields(dto.customFields ?? {});

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
      if (dto.sprintId !== undefined) issue.sprintId = dto.sprintId ?? null;
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
    }

    const statusChanged = result.issue.statusId !== result.previous.statusId;
    const sprintChanged = result.issue.sprintId !== result.previous.sprintId;
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

    return result.issue;
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
      const params = (rule as Record<string, unknown>).params;
      return {
        type: (rule as Record<string, unknown>).type as string,
        params:
          typeof params === 'object' && params !== null && !Array.isArray(params)
            ? (params as Record<string, unknown>)
            : {},
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

  async delete(issueKey: string): Promise<void> {
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

    this.eventDispatcher.emit('issue.deleted', { issueKey, projectKey: issueKey.split('-')[0] });
  }
}
