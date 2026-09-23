import { Injectable, NotFoundException } from '@nestjs/common';
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
    const repo = em.getRepository(NotificationEntity);

    const notification = repo.create({
      userId,
      type,
      title,
      data,
      isRead: false,
    });

    const saved = await repo.save(notification);

    this.gateway.emitToUser(requireTenantContext().tenantId, userId, 'notification:new', saved);

    return saved;
  }

  async findForUser(
    userId: string,
    page = 1,
    perPage = 20,
  ): Promise<PaginatedResponse<NotificationEntity>> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(NotificationEntity);

    const [items, total] = await repo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * perPage,
      take: perPage,
    });

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

    const notification = await repo.findOneBy({ id, userId });
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    notification.isRead = true;
    return repo.save(notification);
  }

  async markAllRead(userId: string): Promise<void> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(NotificationEntity);

    await repo.update({ userId, isRead: false }, { isRead: true });
  }

  async getUnreadCount(userId: string): Promise<number> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(NotificationEntity);

    return repo.count({ where: { userId, isRead: false } });
  }
}
