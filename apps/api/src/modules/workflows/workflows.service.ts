import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import {
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

@Injectable()
export class WorkflowsService {
  constructor(private readonly tenantConnections: TenantConnectionProvider) {}

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

    // Delete transitions first, then statuses, then the workflow
    await em.getRepository(WorkflowTransitionEntity)
      .createQueryBuilder()
      .delete()
      .where('workflow_id = :id', { id })
      .execute();

    await em.getRepository(WorkflowStatusEntity)
      .createQueryBuilder()
      .delete()
      .where('workflow_id = :id', { id })
      .execute();

    await em.getRepository(WorkflowEntity)
      .createQueryBuilder()
      .delete()
      .where('id = :id', { id })
      .execute();
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

    const transitionRepo = em.getRepository(WorkflowTransitionEntity);
    await transitionRepo
      .createQueryBuilder()
      .delete()
      .where('from_status_id = :statusId OR to_status_id = :statusId', { statusId })
      .execute();

    await statusRepo.remove(status);
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

    const repo = em.getRepository(WorkflowTransitionEntity);
    const transition = repo.create({ ...dto, workflowId });
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
}
