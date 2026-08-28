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
      capacity: dto.capacity ?? null,
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

  async update(
    id: string,
    dto: {
      name?: string;
      goal?: string | null;
      startDate?: string | null;
      endDate?: string | null;
      capacity?: number | null;
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

  async getStats(id: string): Promise<SprintStats> {
    const sprint = await this.findById(id);
    const em = await this.tenantConnections.getEntityManager();
    const result = await em
      .getRepository(IssueEntity)
      .createQueryBuilder('issue')
      .leftJoin(WorkflowStatusEntity, 'status', 'status.id = issue.statusId')
      .select('COUNT(issue.id)', 'issueCount')
      .addSelect('COALESCE(SUM(issue.storyPoints), 0)', 'committedPoints')
      .addSelect('SUM(CASE WHEN status.isTerminal = true THEN 1 ELSE 0 END)', 'completedCount')
      .addSelect(
        'COALESCE(SUM(CASE WHEN status.isTerminal = true THEN issue.storyPoints ELSE 0 END), 0)',
        'completedPoints',
      )
      .where('issue.sprintId = :id', { id })
      .getRawOne<{
        issueCount: string;
        committedPoints: string;
        completedCount: string;
        completedPoints: string;
      }>();

    return {
      sprintId: sprint.id,
      capacity: sprint.capacity,
      committedPoints: Number(result?.committedPoints ?? 0),
      issueCount: Number(result?.issueCount ?? 0),
      completedCount: Number(result?.completedCount ?? 0),
      completedPoints: Number(result?.completedPoints ?? 0),
    };
  }
}
