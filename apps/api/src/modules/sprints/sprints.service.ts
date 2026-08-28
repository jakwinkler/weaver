import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { SprintEntity, IssueEntity, WorkflowStatusEntity } from '@weaver/db';
import { CreateSprintDto, SprintStats } from '@weaver/shared';
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

  async findAll(projectId: string): Promise<Array<SprintEntity & { stats: SprintStats }>> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(SprintEntity);
    const sprints = await repo.find({
      where: { projectId },
      order: { createdAt: 'DESC' },
    });

    const statsBySprint = await this.getStatsForSprints(sprints.map((sprint) => sprint.id));
    return sprints.map((sprint) => ({
      ...sprint,
      stats: statsBySprint.get(sprint.id) ?? this.emptyStats(),
    }));
  }

  async getStats(id: string): Promise<SprintStats> {
    await this.findById(id);
    const statsBySprint = await this.getStatsForSprints([id]);
    return statsBySprint.get(id) ?? this.emptyStats();
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

  async update(
    id: string,
    dto: {
      name?: string;
      goal?: string | null;
      startDate?: string | null;
      endDate?: string | null;
    },
  ): Promise<SprintEntity> {
    const sprint = await this.findById(id);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(SprintEntity);

    Object.assign(sprint, dto);
    return repo.save(sprint);
  }

  async delete(id: string): Promise<void> {
    const sprint = await this.findById(id);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(SprintEntity);
    await repo.remove(sprint);
  }

  async start(id: string): Promise<SprintEntity> {
    const sprint = await this.findById(id);

    if (sprint.status !== 'planned') {
      throw new BadRequestException(
        `Sprint can only be started from "planned" status, current status is "${sprint.status}"`,
      );
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
      throw new BadRequestException(
        `Sprint can only be completed from "active" status, current status is "${sprint.status}"`,
      );
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
    await this.findById(id);
    const em = await this.tenantConnections.getEntityManager();
    const issueRepo = em.getRepository(IssueEntity);

    await issueRepo
      .createQueryBuilder()
      .update(IssueEntity)
      .set({ sprintId: id })
      .where({ id: In(issueIds) })
      .execute();
  }

  private emptyStats(): SprintStats {
    return { totalCommittedPoints: 0, totalCompletedPoints: 0 };
  }

  private async getStatsForSprints(sprintIds: string[]): Promise<Map<string, SprintStats>> {
    const statsBySprint = new Map<string, SprintStats>();
    if (sprintIds.length === 0) return statsBySprint;

    const em = await this.tenantConnections.getEntityManager();
    const [issues, terminalStatuses] = await Promise.all([
      em.getRepository(IssueEntity).find({ where: { sprintId: In(sprintIds) } }),
      em.getRepository(WorkflowStatusEntity).find({ where: { isTerminal: true } }),
    ]);
    const terminalStatusIds = new Set(terminalStatuses.map((status) => status.id));

    for (const issue of issues) {
      if (!issue.sprintId) continue;
      const stats = statsBySprint.get(issue.sprintId) ?? this.emptyStats();
      const points = issue.storyPoints ?? 0;
      stats.totalCommittedPoints += points;
      if (terminalStatusIds.has(issue.statusId)) {
        stats.totalCompletedPoints += points;
      }
      statsBySprint.set(issue.sprintId, stats);
    }

    return statsBySprint;
  }
}
