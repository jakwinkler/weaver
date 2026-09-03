import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { TimeEntryEntity, IssueEntity } from '@weaver/db';
import { TenantConnectionProvider } from '../../core/tenant';
import { EventDispatcherService } from '../events';

@Injectable()
export class TimeTrackingService {
  constructor(
    private readonly tenantConnections: TenantConnectionProvider,
    private readonly eventDispatcher: EventDispatcherService,
  ) {}

  private async resolveIssueId(issueKey: string): Promise<string> {
    const em = await this.tenantConnections.getEntityManager();
    const issue = await em.getRepository(IssueEntity).findOneBy({ key: issueKey });
    if (!issue) {
      throw new NotFoundException(`Issue "${issueKey}" not found`);
    }
    return issue.id;
  }

  async create(
    issueKey: string,
    dto: { minutes: number; description?: string },
    userId: string,
  ): Promise<TimeEntryEntity> {
    const issueId = await this.resolveIssueId(issueKey);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(TimeEntryEntity);

    const entry = repo.create({
      issueId,
      userId,
      minutes: dto.minutes,
      description: dto.description ?? null,
      loggedAt: new Date(),
    });

    const saved = await repo.save(entry);

    this.eventDispatcher
      .emit('time.logged', {
        issueKey,
        minutes: dto.minutes,
        description: dto.description,
        userId,
      })
      .catch(() => {});

    return saved;
  }

  async findByIssue(issueKey: string): Promise<TimeEntryEntity[]> {
    const issueId = await this.resolveIssueId(issueKey);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(TimeEntryEntity);

    return repo.find({
      where: { issueId },
      order: { createdAt: 'DESC' },
    });
  }

  async findById(id: string): Promise<TimeEntryEntity> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(TimeEntryEntity);
    const entry = await repo.findOneBy({ id });
    if (!entry) {
      throw new NotFoundException(`Time entry "${id}" not found`);
    }
    return entry;
  }

  private async findByIssueAndId(
    issueKey: string,
    id: string,
  ): Promise<TimeEntryEntity> {
    const issueId = await this.resolveIssueId(issueKey);
    const em = await this.tenantConnections.getEntityManager();
    const entry = await em.getRepository(TimeEntryEntity).findOneBy({ id, issueId });
    if (!entry) {
      throw new NotFoundException(`Time entry "${id}" not found for issue "${issueKey}"`);
    }
    return entry;
  }

  async update(
    issueKey: string,
    id: string,
    dto: Partial<{ minutes: number; description: string }>,
    userId: string,
  ): Promise<TimeEntryEntity> {
    const entry = await this.findByIssueAndId(issueKey, id);
    if (entry.userId !== userId) {
      throw new ForbiddenException('Only the time entry owner can update this entry');
    }
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(TimeEntryEntity);

    if (dto.minutes !== undefined) {
      entry.minutes = dto.minutes;
    }
    if (dto.description !== undefined) {
      entry.description = dto.description;
    }

    return repo.save(entry);
  }

  async delete(issueKey: string, id: string, userId: string): Promise<void> {
    const entry = await this.findByIssueAndId(issueKey, id);
    if (entry.userId !== userId) {
      throw new ForbiddenException('Only the time entry owner can delete this entry');
    }
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(TimeEntryEntity);
    await repo.remove(entry);
  }

  async getSummary(issueKey: string): Promise<{ totalMinutes: number }> {
    const issueId = await this.resolveIssueId(issueKey);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(TimeEntryEntity);

    const result = await repo
      .createQueryBuilder('te')
      .select('COALESCE(SUM(te.minutes), 0)', 'totalMinutes')
      .where('te.issue_id = :issueId', { issueId })
      .getRawOne();

    return { totalMinutes: Number(result.totalMinutes) };
  }
}
