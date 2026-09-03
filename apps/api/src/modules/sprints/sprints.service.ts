import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { SprintEntity, IssueEntity } from '@weaver/db';
import { CreateSprintDto } from '@weaver/shared';
import { TenantConnectionProvider } from '../../core/tenant';
import { In } from 'typeorm';

@Injectable()
export class SprintsService {
  constructor(private readonly tenantConnections: TenantConnectionProvider) {}

  async create(projectId: string, dto: CreateSprintDto): Promise<SprintEntity> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(SprintEntity);

    const sprint = repo.create({
      projectId,
      name: dto.name,
      goal: dto.goal ?? null,
      startDate: dto.startDate ? dto.startDate.toISOString().split('T')[0] : null,
      endDate: dto.endDate ? dto.endDate.toISOString().split('T')[0] : null,
      status: 'planned',
    });

    return repo.save(sprint);
  }

  async findAll(projectId: string): Promise<SprintEntity[]> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(SprintEntity);
    return repo.find({
      where: { projectId },
      order: { createdAt: 'DESC' },
    });
  }

  async findById(id: string): Promise<SprintEntity> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(SprintEntity);
    const sprint = await repo.findOneBy({ id });
    if (!sprint) {
      throw new NotFoundException(`Sprint "${id}" not found`);
    }
    return sprint;
  }

  async update(id: string, dto: { name?: string; goal?: string | null; startDate?: string | null; endDate?: string | null }): Promise<SprintEntity> {
    const sprint = await this.findById(id);
    this.assertPlanned(sprint, 'edited');
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(SprintEntity);

    Object.assign(sprint, dto);
    return repo.save(sprint);
  }

  async delete(id: string): Promise<void> {
    const sprint = await this.findById(id);
    this.assertPlanned(sprint, 'deleted');
    const em = await this.tenantConnections.getEntityManager();
    await em.transaction(async (manager) => {
      await manager.getRepository(IssueEntity).update({ sprintId: id }, { sprintId: null });
      await manager.getRepository(SprintEntity).remove(sprint);
    });
  }

  async start(id: string): Promise<SprintEntity> {
    return this.tenantConnections.runInTenantTransaction(async (manager) => {
      const repo = manager.getRepository(SprintEntity);
      const sprint = await repo.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!sprint) {
        throw new NotFoundException(`Sprint "${id}" not found`);
      }
      if (sprint.status !== 'planned') {
        throw new BadRequestException(`Sprint can only be started from "planned" status, current status is "${sprint.status}"`);
      }

      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `active-sprint:${sprint.projectId}`,
      ]);
      const existingActive = await repo.findOneBy({
        projectId: sprint.projectId,
        status: 'active',
      });
      if (existingActive) {
        throw new BadRequestException('Only one sprint can be active in a project');
      }

      sprint.status = 'active';
      if (!sprint.startDate) {
        sprint.startDate = new Date().toISOString().split('T')[0];
      }
      return repo.save(sprint);
    });
  }

  async complete(id: string): Promise<SprintEntity> {
    return this.tenantConnections.runInTenantTransaction(async (manager) => {
      const repo = manager.getRepository(SprintEntity);
      const sprint = await repo.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!sprint) {
        throw new NotFoundException(`Sprint "${id}" not found`);
      }
      if (sprint.status !== 'active') {
        throw new BadRequestException(`Sprint can only be completed from "active" status, current status is "${sprint.status}"`);
      }

      await manager.query(
        `UPDATE issues
         SET sprint_id = NULL
         WHERE sprint_id = $1
           AND status_id IN (
             SELECT id FROM workflow_statuses WHERE is_terminal = false
           )`,
        [id],
      );
      sprint.status = 'completed';
      if (!sprint.endDate) {
        sprint.endDate = new Date().toISOString().split('T')[0];
      }
      return repo.save(sprint);
    });
  }

  async addIssues(id: string, issueIds: string[]): Promise<void> {
    const uniqueIssueIds = [...new Set(issueIds)];
    await this.tenantConnections.runInTenantTransaction(async (manager) => {
      const sprint = await manager.getRepository(SprintEntity).findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!sprint) {
        throw new NotFoundException(`Sprint "${id}" not found`);
      }
      if (sprint.status === 'completed') {
        throw new BadRequestException('Issues cannot be added to a completed sprint');
      }

      const issueRepo = manager.getRepository(IssueEntity);
      const issues = uniqueIssueIds.length === 0
        ? []
        : await issueRepo.find({
            where: { id: In(uniqueIssueIds) },
            lock: { mode: 'pessimistic_write' },
          });
      if (
        issues.length !== uniqueIssueIds.length ||
        issues.some((issue) => issue.projectId !== sprint.projectId)
      ) {
        throw new BadRequestException('Every issue must exist in the sprint project');
      }
      if (issues.some((issue) => issue.sprintId !== null && issue.sprintId !== id)) {
        throw new BadRequestException('An issue already belongs to another sprint');
      }

      for (const issue of issues) {
        issue.sprintId = id;
      }
      await issueRepo.save(issues);
    });
  }

  private assertPlanned(sprint: SprintEntity, action: string): void {
    if (sprint.status !== 'planned') {
      throw new BadRequestException(
        `Only planned sprints can be ${action}; current status is "${sprint.status}"`,
      );
    }
  }
}
