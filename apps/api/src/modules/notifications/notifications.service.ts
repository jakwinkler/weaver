import { recipientCanReadIssue, recipientIssueCondition } from '@weaver/server-common';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationEntity } from '@weaver/db';
import type { PaginatedResponse } from '@weaver/shared';
import { requireTenantContext, TenantConnectionProvider } from '../../core/tenant';
import { WeaverGateway } from '../../core/websocket';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly tenantConnections: TenantConnectionProvider,
    private readonly gateway: WeaverGateway,
  ) {}

  async create(
    userId: string,
    type: string,
    title: string,
    data: Record<string, unknown> = {},
  ): Promise<NotificationEntity> {
    const em = await this.tenantConnections.getEntityManager();
    const tenantId = requireTenantContext().tenantId;
    const members = await em.query(
      'SELECT 1 FROM public.tenant_memberships WHERE tenant_id = $1 AND user_id = $2',
      [tenantId, userId],
    );
    if (!members.length)
      throw new ForbiddenException('Notification recipient is not an active member');
    if (
      typeof data.issueKey === 'string' &&
      !(await recipientCanReadIssue(em, requireTenantContext().schemaName, tenantId, userId, {
        key: data.issueKey,
      }))
    )
      throw new ForbiddenException('Notification recipient cannot read this issue');
    const repo = em.getRepository(NotificationEntity);

    const notification = repo.create({
      userId,
      type,
      title,
      data,
      isRead: false,
    });

    const saved = await repo.save(notification);

    this.gateway.emitToUser(requireTenantContext().tenantId, userId, 'notification:new', {});

    return saved;
  }

  async findForUser(
    userId: string,
    page = 1,
    perPage = 20,
  ): Promise<PaginatedResponse<NotificationEntity>> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(NotificationEntity);

    const [items, total] = await this.visibleQuery(userId).then((query) =>
      query
        .orderBy('notification.createdAt', 'DESC')
        .skip((page - 1) * perPage)
        .take(perPage)
        .getManyAndCount(),
    );

    return {
      data: items,
      meta: {
        page,
        perPage,
        total,
        totalPages: Math.ceil(total / perPage),
      },
    };
  }

  async markRead(id: string, userId: string): Promise<NotificationEntity> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(NotificationEntity);

    const notification = await (
      await this.visibleQuery(userId)
    )
      .andWhere('notification.id = :id', { id })
      .getOne();
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    notification.isRead = true;
    return repo.save(notification);
  }

  private async visibleQuery(userId: string) {
    const em = await this.tenantConnections.getEntityManager();
    const { tenantId, schemaName } = requireTenantContext();
    return em
      .getRepository(NotificationEntity)
      .createQueryBuilder('notification')
      .where('notification.userId = :recipientId', { recipientId: userId })
      .andWhere(
        `(notification.data->>'issueKey' IS NULL OR ${recipientIssueCondition(schemaName, "notification.data->>'issueKey'", ':recipientId', ':recipientTenant')})`,
        { recipientTenant: tenantId },
      );
  }

  async markAllRead(userId: string): Promise<void> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(NotificationEntity);

    await repo.update({ userId, isRead: false }, { isRead: true });
  }

  async getUnreadCount(userId: string): Promise<number> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(NotificationEntity);

    return (await this.visibleQuery(userId)).andWhere('notification.isRead = false').getCount();
  }
}
