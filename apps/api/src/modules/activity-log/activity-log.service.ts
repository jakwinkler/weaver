import { Injectable, NotFoundException } from '@nestjs/common';
import { ActivityLogEntity, IssueEntity } from '@weaver/db';
import { TenantConnectionProvider } from '../../core/tenant';

@Injectable()
export class ActivityLogService {
  constructor(private readonly tenantConnections: TenantConnectionProvider) {}

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

  async findByIssue(issueKey: string): Promise<ActivityLogEntity[]> {
    const issueId = await this.resolveIssueId(issueKey);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(ActivityLogEntity);

    return repo.find({
      where: { issueId },
      order: { createdAt: 'DESC' },
    });
  }
}
