import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { IssueLinkEntity } from '@weaver/db';
import { TenantConnectionProvider } from '../../core/tenant';

@Injectable()
export class IssueLinksService {
  constructor(private readonly tenantConnections: TenantConnectionProvider) {}

  async create(dto: { linkType: string; sourceIssueId: string; targetIssueId: string }): Promise<IssueLinkEntity> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(IssueLinkEntity);

    const existing = await repo.findOneBy({
      linkType: dto.linkType,
      sourceIssueId: dto.sourceIssueId,
      targetIssueId: dto.targetIssueId,
    });
    if (existing) {
      throw new ConflictException('This issue link already exists');
    }

    const link = repo.create({
      linkType: dto.linkType,
      sourceIssueId: dto.sourceIssueId,
      targetIssueId: dto.targetIssueId,
    });

    return repo.save(link);
  }

  async findByIssue(issueId: string): Promise<IssueLinkEntity[]> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(IssueLinkEntity);

    return repo.find({
      where: [
        { sourceIssueId: issueId },
        { targetIssueId: issueId },
      ],
      order: { createdAt: 'DESC' },
    });
  }

  async delete(id: string): Promise<void> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(IssueLinkEntity);
    const link = await repo.findOneBy({ id });
    if (!link) {
      throw new NotFoundException(`Issue link "${id}" not found`);
    }
    await repo.remove(link);
  }
}
