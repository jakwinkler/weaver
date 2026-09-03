import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import {
  IssueEntity,
  ProjectEntity,
  WorkflowEntity,
  WorkflowStatusEntity,
  WorkflowTransitionEntity,
} from '@weaver/db';
import {
  CreateWorkflowDto,
  CreateWorkflowStatusDto,
  CreateWorkflowTransitionDto,
} from '@weaver/shared';
import { TenantConnectionProvider } from '../../core/tenant';
import { In } from 'typeorm';
import { ConditionEvaluatorRegistry } from './condition-evaluator.registry';
import { PostFunctionRegistry } from './post-function.registry';

@Injectable()
export class WorkflowsService {
  constructor(
    private readonly tenantConnections: TenantConnectionProvider,
    private readonly conditionEvaluators: ConditionEvaluatorRegistry,
    private readonly postFunctions: PostFunctionRegistry,
  ) {}

  async create(dto: CreateWorkflowDto): Promise<WorkflowEntity> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(WorkflowEntity);

    if (dto.isDefault) {
      await repo
        .createQueryBuilder()
        .update(WorkflowEntity)
        .set({ isDefault: false })
        .execute();
    }

    const workflow = repo.create(dto);
    return repo.save(workflow);
  }

  async findAll(): Promise<WorkflowEntity[]> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(WorkflowEntity);
    return repo.find({ relations: ['statuses', 'transitions'] });
  }

  async findById(id: string): Promise<WorkflowEntity> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(WorkflowEntity);
    const workflow = await repo.findOne({
      where: { id },
      relations: ['statuses', 'transitions', 'transitions.fromStatus', 'transitions.toStatus'],
    });
    if (!workflow) {
      throw new NotFoundException(`Workflow "${id}" not found`);
    }
    return workflow;
  }

  async update(id: string, dto: Partial<CreateWorkflowDto>): Promise<WorkflowEntity> {
    const workflow = await this.findById(id);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(WorkflowEntity);

    if (dto.isDefault) {
      await repo
        .createQueryBuilder()
        .update(WorkflowEntity)
        .set({ isDefault: false })
        .execute();
    }

    Object.assign(workflow, dto);
    return repo.save(workflow);
  }

  async delete(id: string): Promise<void> {
    await this.findById(id);
    const em = await this.tenantConnections.getEntityManager();

    const assignedProjects = await em.getRepository(ProjectEntity).countBy({ workflowId: id });
    if (assignedProjects > 0) {
      throw new ConflictException('Workflow cannot be deleted while assigned to a project');
    }

    const statusIds = (
      await em.getRepository(WorkflowStatusEntity).find({
        where: { workflowId: id },
        select: ['id'],
      })
    ).map(({ id: statusId }) => statusId);
    if (
      statusIds.length > 0 &&
      (await em.getRepository(IssueEntity).countBy({ statusId: In(statusIds) })) > 0
    ) {
      throw new ConflictException('Workflow cannot be deleted while its statuses are in use');
    }

    await em.transaction(async (manager) => {
      await manager.getRepository(WorkflowTransitionEntity).delete({ workflowId: id });
      await manager.getRepository(WorkflowStatusEntity).delete({ workflowId: id });
      await manager.getRepository(WorkflowEntity).delete({ id });
    });
  }

  // ── Statuses ──

  async addStatus(workflowId: string, dto: CreateWorkflowStatusDto): Promise<WorkflowStatusEntity> {
    await this.findById(workflowId);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(WorkflowStatusEntity);

    if (dto.isInitial) {
      await repo
        .createQueryBuilder()
        .update(WorkflowStatusEntity)
        .set({ isInitial: false })
        .where('workflow_id = :workflowId', { workflowId })
        .execute();
    }

    const status = repo.create({ ...dto, workflowId });
    return repo.save(status);
  }

  async updateStatus(
    workflowId: string,
    statusId: string,
    dto: Partial<CreateWorkflowStatusDto>,
  ): Promise<WorkflowStatusEntity> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(WorkflowStatusEntity);
    const status = await repo.findOneBy({ id: statusId, workflowId });
    if (!status) {
      throw new NotFoundException(`Status "${statusId}" not found`);
    }

    if (dto.isInitial) {
      await repo
        .createQueryBuilder()
        .update(WorkflowStatusEntity)
        .set({ isInitial: false })
        .where('workflow_id = :workflowId', { workflowId })
        .execute();
    }

    Object.assign(status, dto);
    return repo.save(status);
  }

  async deleteStatus(workflowId: string, statusId: string): Promise<void> {
    const em = await this.tenantConnections.getEntityManager();
    const statusRepo = em.getRepository(WorkflowStatusEntity);
    const status = await statusRepo.findOneBy({ id: statusId, workflowId });
    if (!status) {
      throw new NotFoundException(`Status "${statusId}" not found`);
    }

    if ((await em.getRepository(IssueEntity).countBy({ statusId })) > 0) {
      throw new ConflictException('Status cannot be deleted while it is used by an issue');
    }

    await em.transaction(async (manager) => {
      await manager
        .getRepository(WorkflowTransitionEntity)
        .createQueryBuilder()
        .delete()
        .where('from_status_id = :statusId OR to_status_id = :statusId', { statusId })
        .execute();
      await manager.getRepository(WorkflowStatusEntity).delete({ id: statusId, workflowId });
    });
  }

  // ── Transitions ──

  async addTransition(
    workflowId: string,
    dto: CreateWorkflowTransitionDto,
  ): Promise<WorkflowTransitionEntity> {
    await this.findById(workflowId);
    const em = await this.tenantConnections.getEntityManager();

    const statusRepo = em.getRepository(WorkflowStatusEntity);
    const fromStatus = await statusRepo.findOneBy({ id: dto.fromStatusId, workflowId });
    const toStatus = await statusRepo.findOneBy({ id: dto.toStatusId, workflowId });
    if (!fromStatus || !toStatus) {
      throw new BadRequestException('From/To status must belong to this workflow');
    }
    this.assertRegisteredRules(dto);

    const repo = em.getRepository(WorkflowTransitionEntity);
    const transition = repo.create({ ...dto, workflowId });
    return repo.save(transition);
  }

  async updateTransition(
    workflowId: string,
    transitionId: string,
    dto: Partial<CreateWorkflowTransitionDto>,
  ): Promise<WorkflowTransitionEntity> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(WorkflowTransitionEntity);
    const transition = await repo.findOneBy({ id: transitionId, workflowId });
    if (!transition) {
      throw new NotFoundException(`Transition "${transitionId}" not found`);
    }
    const fromStatusId = dto.fromStatusId ?? transition.fromStatusId;
    const toStatusId = dto.toStatusId ?? transition.toStatusId;
    const statusRepo = em.getRepository(WorkflowStatusEntity);
    const matchingStatusCount = await statusRepo.countBy({
      id: In([fromStatusId, toStatusId]),
      workflowId,
    });
    if (matchingStatusCount !== new Set([fromStatusId, toStatusId]).size) {
      throw new BadRequestException('From/To status must belong to this workflow');
    }
    this.assertRegisteredRules({
      conditions: dto.conditions ?? transition.conditions,
      validators: dto.validators ?? transition.validators,
      postFunctions: dto.postFunctions ?? transition.postFunctions,
    });
    Object.assign(transition, dto);
    return repo.save(transition);
  }

  async deleteTransition(workflowId: string, transitionId: string): Promise<void> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(WorkflowTransitionEntity);
    const transition = await repo.findOneBy({ id: transitionId, workflowId });
    if (!transition) {
      throw new NotFoundException(`Transition "${transitionId}" not found`);
    }
    await repo.remove(transition);
  }

  // ── Workflow Engine ──

  async getAvailableTransitions(workflowId: string, currentStatusId: string): Promise<WorkflowTransitionEntity[]> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(WorkflowTransitionEntity);
    return repo.find({
      where: { workflowId, fromStatusId: currentStatusId },
      relations: ['toStatus'],
    });
  }

  async validateTransition(
    workflowId: string,
    fromStatusId: string,
    toStatusId: string,
  ): Promise<WorkflowTransitionEntity> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(WorkflowTransitionEntity);
    const transition = await repo.findOne({
      where: { workflowId, fromStatusId, toStatusId },
    });
    if (!transition) {
      throw new BadRequestException(
        `No transition exists from status "${fromStatusId}" to "${toStatusId}"`,
      );
    }
    return transition;
  }

  async getDefaultWorkflow(): Promise<WorkflowEntity> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(WorkflowEntity);
    const workflow = await repo.findOne({
      where: { isDefault: true },
      relations: ['statuses', 'transitions'],
    });
    if (!workflow) {
      throw new NotFoundException('No default workflow found');
    }
    return workflow;
  }

  private assertRegisteredRules(rules: {
    conditions?: unknown[];
    validators?: unknown[];
    postFunctions?: unknown[];
  }): void {
    for (const [label, values] of [
      ['condition', rules.conditions ?? []],
      ['validator', rules.validators ?? []],
    ] as const) {
      for (const rule of values) {
        const type = this.ruleType(rule, label);
        if (!this.conditionEvaluators.has(type)) {
          throw new BadRequestException(
            `Workflow ${label} evaluator "${type}" is not registered`,
          );
        }
      }
    }

    for (const rule of rules.postFunctions ?? []) {
      const type = this.ruleType(rule, 'post-function');
      if (!this.postFunctions.has(type)) {
        throw new BadRequestException(
          `Workflow post-function "${type}" is not registered`,
        );
      }
    }
  }

  private ruleType(rule: unknown, label: string): string {
    if (
      typeof rule !== 'object' ||
      rule === null ||
      typeof (rule as Record<string, unknown>).type !== 'string' ||
      !(rule as Record<string, unknown>).type
    ) {
      throw new BadRequestException(`Workflow ${label} configuration is invalid`);
    }
    return (rule as Record<string, unknown>).type as string;
  }
}
