import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CommentEntity, IssueEntity, ProjectEntity } from '@weaver/db';
import { CreateCommentDto } from '@weaver/shared';
import { getTenantContext, TenantConnectionProvider } from '../../core/tenant';
import { UsersService } from '../users';
import { EventDispatcherService } from '../events';
import { NotificationsService } from '../notifications';
import { MentionService } from './mention.service';
import { MailService } from '../mail';

@Injectable()
export class CommentsService {
  private readonly logger = new Logger(CommentsService.name);

  constructor(
    private readonly tenantConnections: TenantConnectionProvider,
    private readonly usersService: UsersService,
    private readonly eventDispatcher: EventDispatcherService,
    private readonly notificationsService: NotificationsService,
    private readonly mentionService: MentionService,
    private readonly mailService: MailService,
  ) {}

  private async resolveIssue(issueKey: string): Promise<IssueEntity> {
    const em = await this.tenantConnections.getEntityManager();
    const issue = await em.getRepository(IssueEntity).findOneBy({ key: issueKey });
    if (!issue) {
      throw new NotFoundException(`Issue "${issueKey}" not found`);
    }
    return issue;
  }

  async create(
    issueKey: string,
    dto: CreateCommentDto,
    authorId: string,
    tenantId: string,
  ): Promise<CommentEntity> {
    const issue = await this.resolveIssue(issueKey);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(CommentEntity);

    const body = dto.body as Record<string, unknown> | null;
    const mentionedUserIds = this.mentionService
      .extractMentions(body)
      .filter((mentionedUserId) => mentionedUserId !== authorId);
    const tenantMemberIds = await this.usersService.filterTenantMemberIds(
      tenantId,
      mentionedUserIds,
    );

    const comment = repo.create({
      issueId: issue.id,
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
    for (const mentionedUserId of tenantMemberIds) {
      try {
        await this.notificationsService.create(mentionedUserId, 'mention', `@You in ${issueKey}`, {
          issueKey,
          commentId: saved.id,
        });
      } catch (error) {
        this.logger.warn(
          `Could not create mention notification for user ${mentionedUserId}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }

    await this.sendCommentEmails(issue, authorId, tenantMemberIds, body);

    return saved;
  }

  async findByIssue(issueKey: string) {
    const issueId = (await this.resolveIssue(issueKey)).id;
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

  async update(
    id: string,
    dto: CreateCommentDto,
    updaterId: string,
    tenantId: string,
  ): Promise<CommentEntity> {
    const comment = await this.findById(id);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(CommentEntity);

    // Diff mentions: only notify newly mentioned users
    const oldMentions = new Set(
      this.mentionService.extractMentions(comment.body as Record<string, unknown> | null),
    );
    const newBody = dto.body as Record<string, unknown> | null;
    const newMentions = this.mentionService.extractMentions(newBody);

    const newRecipientIds = newMentions.filter(
      (mentionedUserId) => !oldMentions.has(mentionedUserId) && mentionedUserId !== updaterId,
    );
    const tenantMemberIds = await this.usersService.filterTenantMemberIds(
      tenantId,
      newRecipientIds,
    );

    comment.body = dto.body;
    const saved = await repo.save(comment);

    // Resolve issueKey for notification
    const issue = await em.getRepository(IssueEntity).findOneBy({ id: comment.issueId });
    const issueKey = issue?.key ?? 'UNKNOWN';

    if (issue) {
      this.eventDispatcher.emit('comment.updated', {
        commentId: saved.id,
        issueKey: issue.key,
        projectKey: issue.key.split('-')[0],
        userId: updaterId ?? null,
      });
    }

    for (const mentionedUserId of tenantMemberIds) {
      try {
        await this.notificationsService.create(mentionedUserId, 'mention', `@You in ${issueKey}`, {
          issueKey,
          commentId: saved.id,
        });
      } catch (error) {
        this.logger.warn(
          `Could not create mention notification for user ${mentionedUserId}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }

    if (issue) {
      await this.sendMentionEmails(issue, updaterId, tenantMemberIds, newBody);
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

  private async sendCommentEmails(
    issue: IssueEntity,
    authorId: string,
    mentionedUserIds: string[],
    body: Record<string, unknown> | null,
  ): Promise<void> {
    const tenantId = getTenantContext()?.tenantId;
    if (!tenantId) return;

    try {
      const context = await this.emailContext(issue, authorId, body);
      const mentioned = new Set(mentionedUserIds);
      const commentRecipients = [
        ...new Set(
          [issue.reporterId, issue.assigneeId].filter((userId): userId is string =>
            Boolean(userId),
          ),
        ),
      ].filter((userId) => userId !== authorId && !mentioned.has(userId));

      await Promise.all([
        ...mentionedUserIds
          .filter((userId) => userId !== authorId)
          .map((userId) =>
            this.mailService.enqueueNotification({
              tenantId,
              userId,
              preference: 'emailOnMention',
              template: 'mentioned-in-comment',
              context,
            }),
          ),
        ...commentRecipients.map((userId) =>
          this.mailService.enqueueNotification({
            tenantId,
            userId,
            preference: 'emailOnComment',
            template: 'comment-added',
            context,
          }),
        ),
      ]);
    } catch (error) {
      this.logger.warn(`Unable to prepare comment emails for ${issue.key}: ${String(error)}`);
    }
  }

  private async sendMentionEmails(
    issue: IssueEntity,
    actorId: string,
    mentionedUserIds: string[],
    body: Record<string, unknown> | null,
  ): Promise<void> {
    const tenantId = getTenantContext()?.tenantId;
    if (!tenantId || mentionedUserIds.length === 0) return;

    try {
      const context = await this.emailContext(issue, actorId, body);
      await Promise.all(
        mentionedUserIds.map((userId) =>
          this.mailService.enqueueNotification({
            tenantId,
            userId,
            preference: 'emailOnMention',
            template: 'mentioned-in-comment',
            context,
          }),
        ),
      );
    } catch (error) {
      this.logger.warn(`Unable to prepare mention emails for ${issue.key}: ${String(error)}`);
    }
  }

  private async emailContext(
    issue: IssueEntity,
    actorId: string,
    body: Record<string, unknown> | null,
  ): Promise<Record<string, unknown>> {
    const em = await this.tenantConnections.getEntityManager();
    const [actor, project] = await Promise.all([
      this.usersService.findById(actorId),
      em.getRepository(ProjectEntity).findOneBy({ id: issue.projectId }),
    ]);

    return {
      actorName: actor.displayName || actor.email,
      issueKey: issue.key,
      issueSummary: issue.summary,
      projectName: project?.name ?? issue.key.split('-')[0],
      commentExcerpt: this.commentExcerpt(body),
      issueUrl: this.mailService.issueUrl(issue.key),
    };
  }

  private commentExcerpt(body: Record<string, unknown> | null): string {
    const parts: string[] = [];

    const walk = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      const record = node as Record<string, unknown>;
      if (typeof record.text === 'string') {
        parts.push(record.text);
      } else if (record.type === 'mention') {
        const attrs = record.attrs as Record<string, unknown> | undefined;
        const label = attrs?.label;
        if (typeof label === 'string') parts.push(`@${label}`);
      }
      if (Array.isArray(record.content)) {
        record.content.forEach(walk);
      }
    };

    walk(body);
    const text = parts.join(' ').replace(/\s+/g, ' ').trim();
    if (!text) return 'Open Weaver to view the comment.';
    return text.length > 240 ? `${text.slice(0, 237)}...` : text;
  }
}
