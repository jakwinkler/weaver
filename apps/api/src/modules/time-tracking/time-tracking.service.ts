import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TimeEntryEntity, IssueEntity } from '@weaver/db';
import type {
  PluginTimeEntryBatchRequest,
  PluginTimeEntryBatchResult,
  PluginTimeEntryChanges,
  PluginTimeEntryFilters,
  PluginTimeEntryLockState,
} from '@weaver/sdk';
import { In, type EntityManager } from 'typeorm';
import { TenantConnectionProvider } from '../../core/tenant';
import { EventDispatcherService } from '../events';

@Injectable()
export class TimeTrackingService {
  constructor(
    private readonly tenantConnections: TenantConnectionProvider,
    private readonly eventDispatcher: EventDispatcherService,
  ) {}

  private async resolveIssueId(issueKey: string, manager?: EntityManager): Promise<string> {
    const em = manager ?? (await this.tenantConnections.getEntityManager());
    const issue = await em.getRepository(IssueEntity).findOneBy({ key: issueKey });
    if (!issue) {
      throw new NotFoundException(`Issue "${issueKey}" not found`);
    }
    return issue.id;
  }

  async create(
    issueKey: string,
    dto: { minutes: number; description?: string; source?: 'manual' | 'timer' },
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
      startedAt: null,
      endedAt: null,
      source: dto.source ?? 'manual',
      sourcePluginId: null,
      sourceReference: null,
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

  async update(
    id: string,
    dto: Partial<{ minutes: number; description: string }>,
  ): Promise<TimeEntryEntity> {
    const entry = await this.findById(id);
    this.assertUnlocked(entry);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(TimeEntryEntity);

    if (dto.minutes !== undefined) {
      entry.minutes = dto.minutes;
    }
    if (dto.description !== undefined) {
      entry.description = dto.description;
    }

    const saved = await repo.save(entry);
    this.eventDispatcher
      .emit('time.updated', {
        entryId: saved.id,
        userId: saved.userId,
      })
      .catch(() => {});
    return saved;
  }

  async delete(id: string): Promise<void> {
    const entry = await this.findById(id);
    this.assertUnlocked(entry);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(TimeEntryEntity);
    await repo.remove(entry);
    this.eventDispatcher
      .emit('time.deleted', {
        entryId: entry.id,
        userId: entry.userId,
      })
      .catch(() => {});
  }

  async createBatch(
    pluginId: string,
    request: PluginTimeEntryBatchRequest,
    userId: string,
  ): Promise<PluginTimeEntryBatchResult> {
    if (request.entries.length === 0) {
      throw new BadRequestException('A time-entry batch must contain at least one entry');
    }

    const references = request.entries.map((entry) => entry.sourceReference);
    if (new Set(references).size !== references.length) {
      throw new BadRequestException('Plugin source references must be unique within a batch');
    }

    const em = await this.tenantConnections.getEntityManager();
    const result = await em.transaction(async (manager) => {
      const repo = manager.getRepository(TimeEntryEntity);
      const entries: TimeEntryEntity[] = [];
      const createdEntries: Array<{ entry: TimeEntryEntity; issueKey: string }> = [];

      for (const item of request.entries) {
        this.validateBatchItem(item);
        const existing = await repo.findOneBy({
          sourcePluginId: pluginId,
          sourceReference: item.sourceReference,
        });

        if (existing) {
          if (existing.userId !== userId) {
            throw new ForbiddenException('Plugin source reference belongs to another user');
          }
          entries.push(existing);
          continue;
        }

        const issueId = await this.resolveIssueId(item.issueKey, manager);
        const startedAt = item.startedAt ? new Date(item.startedAt) : null;
        const endedAt = item.endedAt ? new Date(item.endedAt) : null;
        const entry = repo.create({
          issueId,
          userId,
          minutes: item.minutes,
          description: item.description ?? null,
          loggedAt: item.loggedAt ? new Date(item.loggedAt) : (startedAt ?? new Date()),
          startedAt,
          endedAt,
          source: 'plugin',
          sourcePluginId: pluginId,
          sourceReference: item.sourceReference,
          lockedAt: null,
          lockReason: null,
        });
        const saved = await repo.save(entry);
        entries.push(saved);
        createdEntries.push({ entry: saved, issueKey: item.issueKey });
      }

      return { entries, createdEntries };
    });

    for (const { entry, issueKey } of result.createdEntries) {
      this.eventDispatcher
        .emit('time.logged', {
          entryId: entry.id,
          issueKey,
          minutes: entry.minutes,
          description: entry.description ?? undefined,
          userId,
          source: 'plugin',
          sourcePluginId: pluginId,
          sourceReference: entry.sourceReference,
        })
        .catch(() => {});
    }

    return { entries: result.entries, created: result.createdEntries.length };
  }

  async updatePluginEntry(
    pluginId: string,
    id: string,
    changes: PluginTimeEntryChanges,
    userId: string,
  ): Promise<TimeEntryEntity> {
    const entry = await this.findPluginEntry(pluginId, id, userId);
    this.assertUnlocked(entry);

    if (changes.minutes !== undefined) {
      if (!Number.isInteger(changes.minutes) || changes.minutes < 1) {
        throw new BadRequestException('Time-entry minutes must be a positive integer');
      }
      entry.minutes = changes.minutes;
    }
    if (changes.description !== undefined) {
      if (changes.description && changes.description.length > 500) {
        throw new BadRequestException('Time-entry description cannot exceed 500 characters');
      }
      entry.description = changes.description;
    }
    if (changes.startedAt !== undefined) {
      entry.startedAt = this.parseNullableTimestamp(changes.startedAt, 'startedAt');
    }
    if (changes.endedAt !== undefined) {
      entry.endedAt = this.parseNullableTimestamp(changes.endedAt, 'endedAt');
    }
    if (entry.startedAt && entry.endedAt && entry.endedAt <= entry.startedAt) {
      throw new BadRequestException('endedAt must be after startedAt');
    }

    const em = await this.tenantConnections.getEntityManager();
    const saved = await em.getRepository(TimeEntryEntity).save(entry);
    this.eventDispatcher
      .emit('time.updated', {
        entryId: saved.id,
        userId,
        sourcePluginId: pluginId,
      })
      .catch(() => {});
    return saved;
  }

  async deletePluginEntry(pluginId: string, id: string, userId: string): Promise<void> {
    const entry = await this.findPluginEntry(pluginId, id, userId);
    this.assertUnlocked(entry);
    const em = await this.tenantConnections.getEntityManager();
    await em.getRepository(TimeEntryEntity).remove(entry);
    this.eventDispatcher
      .emit('time.deleted', {
        entryId: entry.id,
        userId,
        sourcePluginId: pluginId,
      })
      .catch(() => {});
  }

  async listPluginEntries(
    pluginId: string,
    filters: PluginTimeEntryFilters,
    userId: string,
  ): Promise<TimeEntryEntity[]> {
    const em = await this.tenantConnections.getEntityManager();
    const qb = em
      .getRepository(TimeEntryEntity)
      .createQueryBuilder('entry')
      .innerJoin(IssueEntity, 'issue', 'issue.id = entry.issue_id')
      .where('entry.source_plugin_id = :pluginId', { pluginId })
      .andWhere('entry.user_id = :userId', { userId });

    if (filters.issueKeys?.length) {
      qb.andWhere('issue.key IN (:...issueKeys)', { issueKeys: filters.issueKeys });
    }
    if (filters.sourceReferences?.length) {
      qb.andWhere('entry.source_reference IN (:...sourceReferences)', {
        sourceReferences: filters.sourceReferences,
      });
    }
    if (filters.loggedFrom) {
      qb.andWhere('entry.logged_at >= :loggedFrom', { loggedFrom: filters.loggedFrom });
    }
    if (filters.loggedTo) {
      qb.andWhere('entry.logged_at <= :loggedTo', { loggedTo: filters.loggedTo });
    }

    return qb.orderBy('entry.logged_at', 'DESC').getMany();
  }

  async getPluginLockState(
    pluginId: string,
    ids: string[],
    userId: string,
  ): Promise<PluginTimeEntryLockState[]> {
    if (ids.length === 0) return [];
    const em = await this.tenantConnections.getEntityManager();
    const entries = await em.getRepository(TimeEntryEntity).find({
      where: { id: In(ids), sourcePluginId: pluginId, userId },
    });
    const byId = new Map(entries.map((entry) => [entry.id, entry]));

    return ids.map((id) => {
      const entry = byId.get(id);
      if (!entry) {
        throw new NotFoundException(`Time entry "${id}" not found`);
      }
      return {
        id,
        locked: entry.lockedAt !== null,
        lockedAt: entry.lockedAt,
        lockReason: entry.lockReason,
      };
    });
  }

  private async findPluginEntry(
    pluginId: string,
    id: string,
    userId: string,
  ): Promise<TimeEntryEntity> {
    const em = await this.tenantConnections.getEntityManager();
    const entry = await em.getRepository(TimeEntryEntity).findOneBy({
      id,
      sourcePluginId: pluginId,
      userId,
    });
    if (!entry) {
      throw new NotFoundException(`Time entry "${id}" not found`);
    }
    return entry;
  }

  private assertUnlocked(entry: TimeEntryEntity): void {
    if (!entry.lockedAt) return;

    const suffix = entry.lockReason ? `: ${entry.lockReason}` : '';
    throw new ConflictException(`Time entry "${entry.id}" is locked${suffix}`);
  }

  private validateBatchItem(item: PluginTimeEntryBatchRequest['entries'][number]): void {
    if (!item.sourceReference || item.sourceReference.length > 255) {
      throw new BadRequestException('Plugin source reference must be between 1 and 255 characters');
    }
    if (!Number.isInteger(item.minutes) || item.minutes < 1) {
      throw new BadRequestException('Time-entry minutes must be a positive integer');
    }
    if (item.description && item.description.length > 500) {
      throw new BadRequestException('Time-entry description cannot exceed 500 characters');
    }

    const startedAt = item.startedAt ? Date.parse(item.startedAt) : null;
    const endedAt = item.endedAt ? Date.parse(item.endedAt) : null;
    const loggedAt = item.loggedAt ? Date.parse(item.loggedAt) : null;
    if (startedAt !== null && !Number.isFinite(startedAt)) {
      throw new BadRequestException('startedAt must be an ISO-8601 timestamp');
    }
    if (endedAt !== null && !Number.isFinite(endedAt)) {
      throw new BadRequestException('endedAt must be an ISO-8601 timestamp');
    }
    if (loggedAt !== null && !Number.isFinite(loggedAt)) {
      throw new BadRequestException('loggedAt must be an ISO-8601 timestamp');
    }
    if (startedAt !== null && endedAt !== null && endedAt <= startedAt) {
      throw new BadRequestException('endedAt must be after startedAt');
    }
  }

  private parseNullableTimestamp(value: string | null, label: string): Date | null {
    if (value === null) return null;
    const milliseconds = Date.parse(value);
    if (!Number.isFinite(milliseconds)) {
      throw new BadRequestException(`${label} must be an ISO-8601 timestamp`);
    }
    return new Date(milliseconds);
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
