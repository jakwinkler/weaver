import { Injectable, NotFoundException } from '@nestjs/common';
import { CommentEntity, IssueEntity } from '@weaver/db';
import { CreateCommentDto } from '@weaver/shared';
import { TenantConnectionProvider } from '../../core/tenant';
import { UsersService } from '../users';
import { EventDispatcherService } from '../events';
import { NotificationsService } from '../notifications';
import { MentionService } from './mention.service';

@Injectable()
export class CommentsService {
  constructor(
    private readonly tenantConnections: TenantConnectionProvider,
    private readonly usersService: UsersService,
    private readonly eventDispatcher: EventDispatcherService,
    private readonly notificationsService: NotificationsService,
    private readonly mentionService: MentionService,
  ) {}

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

    const saved = await repo.save(comment);

    this.eventDispatcher.emit('comment.created', {
      commentId: saved.id,
      issueKey,
      projectKey: issueKey.split('-')[0],
      userId: authorId,
    });

    // Send mention notifications
    const body = dto.body as Record<string, unknown> | null;
    const mentionedUserIds = this.mentionService.extractMentions(body);
    for (const mentionedUserId of mentionedUserIds) {
      if (mentionedUserId === authorId) continue; // skip self-mentions
      try {
        await this.notificationsService.create(
          mentionedUserId,
          'mention',
          `@You in ${issueKey}`,
          { issueKey, commentId: saved.id },
        );
      } catch {
        // Ignore notification failures (e.g. invalid userId)
      }
    }

    return saved;
  }

  async findByIssue(issueKey: string) {
    const issueId = await this.resolveIssueId(issueKey);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(CommentEntity);

    const comments = await repo.find({
      where: { issueId },
      order: { createdAt: 'ASC' },
    });

    if (comments.length === 0) return [];

    const authorIds = [...new Set(comments.map((c) => c.authorId))];
    const authorMap = new Map<string, { displayName: string; email: string; avatarUrl?: string }>();
    for (const uid of authorIds) {
      try {
        const user = await this.usersService.findById(uid);
        authorMap.set(uid, {
          displayName: user.displayName || user.email,
          email: user.email,
          avatarUrl: user.avatarUrl ?? undefined,
        });
      } catch {
        authorMap.set(uid, { displayName: 'Unknown user', email: '' });
      }
    }

    return comments.map((c) => {
      const author = authorMap.get(c.authorId);
      return {
        id: c.id,
        issueId: c.issueId,
        authorId: c.authorId,
        authorDisplayName: author?.displayName ?? 'Unknown user',
        authorEmail: author?.email ?? '',
        authorAvatarUrl: author?.avatarUrl ?? null,
        body: c.body,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      };
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

  async update(id: string, dto: CreateCommentDto, updaterId?: string): Promise<CommentEntity> {
    const comment = await this.findById(id);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(CommentEntity);

    // Diff mentions: only notify newly mentioned users
    const oldMentions = new Set(this.mentionService.extractMentions(comment.body as Record<string, unknown> | null));
    const newBody = dto.body as Record<string, unknown> | null;
    const newMentions = this.mentionService.extractMentions(newBody);

    comment.body = dto.body;
    const saved = await repo.save(comment);

    // Resolve issueKey for notification
    const issue = await em.getRepository(IssueEntity).findOneBy({ id: comment.issueId });
    const issueKey = issue?.key ?? 'UNKNOWN';

    for (const mentionedUserId of newMentions) {
      if (oldMentions.has(mentionedUserId)) continue; // already mentioned
      if (updaterId && mentionedUserId === updaterId) continue; // skip self-mentions
      try {
        await this.notificationsService.create(
          mentionedUserId,
          'mention',
          `@You in ${issueKey}`,
          { issueKey, commentId: saved.id },
        );
      } catch {
        // Ignore notification failures
      }
    }

    return saved;
  }

  async delete(id: string, userId?: string): Promise<void> {
    const comment = await this.findById(id);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(CommentEntity);

    // Resolve issueKey for event
    const issue = await em.getRepository(IssueEntity).findOneBy({ id: comment.issueId });
    await repo.remove(comment);

    if (issue) {
      this.eventDispatcher.emit('comment.deleted', {
        commentId: id,
        issueKey: issue.key,
        projectKey: issue.key.split('-')[0],
        userId: userId ?? null,
      });
    }
  }
}
