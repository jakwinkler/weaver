import { tenantStorage } from '../../core/tenant/tenant.context';
import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  it('returns a 404-compatible error when a notification is missing', async () => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };
    const repo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
    const service = new NotificationsService(
      { getEntityManager: jest.fn().mockResolvedValue({ getRepository: () => repo }) } as never,
      {} as never,
    );

    await expect(
      tenantStorage.run({ tenantId: 'tenant-a', schemaName: 'tenant_a' }, () =>
        service.markRead('missing', 'user-a'),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
