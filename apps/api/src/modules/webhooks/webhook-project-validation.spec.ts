import { WebhooksService } from './webhooks.service';
jest.mock('../../core/security/outbound-http', () => ({ assertSafeOutboundUrl: jest.fn() }));

it('rejects a missing webhook project before inserting', async () => {
  const repo = {
    findOneBy: jest.fn().mockResolvedValue(null),
    create: jest.fn((value) => value),
    save: jest.fn().mockResolvedValue({}),
  };
  const service = new WebhooksService(
    { getEntityManager: async () => ({ getRepository: () => repo }) } as any,
    {} as any,
  );
  await expect(
    service.create({
      url: 'https://example.com',
      events: ['issue.created'],
      projectId: '0a1c9c34-a96c-4363-a962-77eb53ea1d72',
    }),
  ).rejects.toMatchObject({ status: 400 });
  expect(repo.save).not.toHaveBeenCalled();
});
