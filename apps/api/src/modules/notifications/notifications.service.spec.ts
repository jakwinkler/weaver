import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  it('returns a 404-compatible error when a notification is missing', async () => {
    const repo = { findOneBy: jest.fn().mockResolvedValue(null) };
    const service = new NotificationsService(
      { getEntityManager: jest.fn().mockResolvedValue({ getRepository: () => repo }) } as never,
      {} as never,
    );

    await expect(service.markRead('missing', 'user-a')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
