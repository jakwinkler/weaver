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
    const sprint = await this.findById(id);

    if (sprint.status !== 'planned') {
      throw new BadRequestException(`Sprint can only be started from "planned" status, current status is "${sprint.status}"`);
    }

    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(SprintEntity);

    sprint.status = 'active';
    if (!sprint.startDate) {
      sprint.startDate = new Date().toISOString().split('T')[0];
    }

    return repo.save(sprint);
  }

  async complete(id: string): Promise<SprintEntity> {
    const sprint = await this.findById(id);

    if (sprint.status !== 'active') {
      throw new BadRequestException(`Sprint can only be completed from "active" status, current status is "${sprint.status}"`);
    }

    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(SprintEntity);

    sprint.status = 'completed';
    if (!sprint.endDate) {
      sprint.endDate = new Date().toISOString().split('T')[0];
    }

    return repo.save(sprint);
  }

  async addIssues(id: string, issueIds: string[]): Promise<void> {
    const sprint = await this.findById(id);
    const em = await this.tenantConnections.getEntityManager();
    const issueRepo = em.getRepository(IssueEntity);
    const uniqueIssueIds = [...new Set(issueIds)];
    const matchingIssueCount = await issueRepo.countBy({
      id: In(uniqueIssueIds),
      projectId: sprint.projectId,
    });

    if (matchingIssueCount !== uniqueIssueIds.length) {
      throw new BadRequestException('Every issue must exist in the sprint project');
    }

    await issueRepo
      .createQueryBuilder()
      .update(IssueEntity)
      .set({ sprintId: id })
      .where({ id: In(uniqueIssueIds) })
      .execute();
  }

  private assertPlanned(sprint: SprintEntity, action: string): void {
    if (sprint.status !== 'planned') {
      throw new BadRequestException(
        `Only planned sprints can be ${action}; current status is "${sprint.status}"`,
      );
    }
  }
}
