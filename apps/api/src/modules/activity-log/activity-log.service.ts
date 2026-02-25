import { Injectable, NotFoundException } from '@nestjs/common';
import { ActivityLogEntity, IssueEntity, WorkflowStatusEntity } from '@weaver/db';
import { TenantConnectionProvider } from '../../core/tenant';
import { UsersService } from '../users';
import { In } from 'typeorm';

@Injectable()
export class ActivityLogService {
  constructor(
    private readonly tenantConnections: TenantConnectionProvider,
    private readonly usersService: UsersService,
  ) {}

  private async resolveIssueId(issueKey: string): Promise<string> {
    const em = await this.tenantConnections.getEntityManager();
    const issue = await em.getRepository(IssueEntity).findOneBy({ key: issueKey });
    if (!issue) {
      throw new NotFoundException(`Issue "${issueKey}" not found`);
    }
    return issue.id;
  }

  async create(dto: {
    issueId: string;
    userId: string;
    action: string;
    fieldName?: string | null;
    oldValue?: string | null;
    newValue?: string | null;
  }): Promise<ActivityLogEntity> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(ActivityLogEntity);

    const entry = repo.create({
      issueId: dto.issueId,
      userId: dto.userId,
      action: dto.action,
      fieldName: dto.fieldName ?? null,
      oldValue: dto.oldValue ?? null,
      newValue: dto.newValue ?? null,
    });

    return repo.save(entry);
  }

  async findByIssue(issueKey: string) {
    const issueId = await this.resolveIssueId(issueKey);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(ActivityLogEntity);

    const entries = await repo.find({
      where: { issueId },
      order: { createdAt: 'DESC' },
    });

    if (entries.length === 0) return [];

    // Resolve user display names
    const userIds = [...new Set(entries.map((e) => e.userId).filter(Boolean))] as string[];
    const userMap = new Map<string, { displayName: string; email: string; avatarUrl?: string }>();
    for (const uid of userIds) {
      try {
        const user = await this.usersService.findById(uid);
        userMap.set(uid, {
          displayName: user.displayName || user.email,
          email: user.email,
          avatarUrl: user.avatarUrl ?? undefined,
        });
      } catch {
        userMap.set(uid, { displayName: 'Unknown user', email: '' });
      }
    }

    // Resolve status UUIDs to names (older entries may have UUIDs, newer ones already have names)
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const statusUuids = new Set<string>();
    for (const e of entries) {
      if (e.fieldName === 'status') {
        if (e.oldValue && UUID_RE.test(e.oldValue)) statusUuids.add(e.oldValue);
        if (e.newValue && UUID_RE.test(e.newValue)) statusUuids.add(e.newValue);
      }
    }
    const statusMap = new Map<string, string>();
    if (statusUuids.size > 0) {
      const statusRepo = em.getRepository(WorkflowStatusEntity);
      const statuses = await statusRepo.find({
        where: { id: In([...statusUuids]) },
        select: ['id', 'name'],
      });
      for (const s of statuses) {
        statusMap.set(s.id, s.name);
      }
    }

    return entries.map((e) => {
      const u = e.userId ? userMap.get(e.userId) : undefined;
      return {
        id: e.id,
        userId: e.userId,
        userDisplayName: u?.displayName ?? 'Unknown user',
        userEmail: u?.email ?? '',
        userAvatarUrl: u?.avatarUrl ?? null,
        action: e.action,
        fieldName: e.fieldName,
        oldValue: e.fieldName === 'status' && e.oldValue && UUID_RE.test(e.oldValue)
          ? statusMap.get(e.oldValue) ?? e.oldValue
          : e.oldValue,
        newValue: e.fieldName === 'status' && e.newValue && UUID_RE.test(e.newValue)
          ? statusMap.get(e.newValue) ?? e.newValue
          : e.newValue,
        createdAt: e.createdAt,
      };
    });
  }
}
