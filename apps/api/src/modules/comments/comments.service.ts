import { Injectable, NotFoundException } from '@nestjs/common';
import { CommentEntity, IssueEntity } from '@weaver/db';
import { CreateCommentDto } from '@weaver/shared';
import { TenantConnectionProvider } from '../../core/tenant';

@Injectable()
export class CommentsService {
  constructor(private readonly tenantConnections: TenantConnectionProvider) {}

  private async resolveIssueId(issueKey: string): Promise<string> {
    const em = await this.tenantConnections.getEntityManager();
    const issue = await em.getRepository(IssueEntity).findOneBy({ key: issueKey });
    if (!issue) {
      throw new NotFoundException(`Issue "${issueKey}" not found`);
    }
    return issue.id;
  }

  async create(issueKey: string, dto: CreateCommentDto, authorId: string): Promise<CommentEntity> {
    const issueId = await this.resolveIssueId(issueKey);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(CommentEntity);

    const comment = repo.create({
      issueId,
      authorId,
      body: dto.body,
    });

    return repo.save(comment);
  }

  async findByIssue(issueKey: string): Promise<CommentEntity[]> {
    const issueId = await this.resolveIssueId(issueKey);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(CommentEntity);

    return repo.find({
      where: { issueId },
      order: { createdAt: 'ASC' },
    });
  }

  async findById(id: string): Promise<CommentEntity> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(CommentEntity);
    const comment = await repo.findOneBy({ id });
    if (!comment) {
      throw new NotFoundException(`Comment "${id}" not found`);
    }
    return comment;
  }

  async update(id: string, dto: CreateCommentDto): Promise<CommentEntity> {
    const comment = await this.findById(id);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(CommentEntity);

    comment.body = dto.body;
    return repo.save(comment);
  }

  async delete(id: string): Promise<void> {
    const comment = await this.findById(id);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(CommentEntity);
    await repo.remove(comment);
  }
}
