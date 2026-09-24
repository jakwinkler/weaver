import { AttachmentsService } from './attachments.service';
import { AttachmentsController } from './attachments.controller';

describe('attachment deletion route binding', () => {
  it('preserves file content if database deletion fails', async () => {
    const storage = { delete: jest.fn() };
    const repo = {
      remove: jest.fn().mockRejectedValue(new Error('database failure')),
      findOneBy: jest.fn().mockResolvedValue({ id: 'issue' }),
      insert: jest.fn(),
    };
    const manager = { getRepository: () => repo, query: jest.fn() };
    const service = new AttachmentsService(
      {
        getEntityManager: async () => manager,
        runInTenantTransaction: async (fn: any) => fn(manager),
      } as any,
      storage as any,
    );
    jest
      .spyOn(service, 'findById')
      .mockResolvedValue({ id: 'file', issueId: 'issue', storageKey: 'key' } as any);
    await expect(service.delete('file', 'OWN-1')).rejects.toThrow('database failure');
    expect(storage.delete).not.toHaveBeenCalled();
  });
  it.each(['other-issue', null])(
    'does not delete an attachment belonging to %s',
    async (issueId) => {
      const storage = { delete: jest.fn() };
      const repo = {
        remove: jest.fn(),
        findOneBy: jest.fn().mockResolvedValue({ id: 'route-issue' }),
      };
      const service = new AttachmentsService(
        {
          getEntityManager: async () => ({ getRepository: () => repo }),
          runInTenantTransaction: async (fn: any) => fn({ getRepository: () => repo }),
        } as any,
        storage as any,
      );
      jest
        .spyOn(service, 'findById')
        .mockResolvedValue({ id: 'file', issueId, storageKey: 'key' } as any);
      const controller = new AttachmentsController(service);
      await expect((controller.delete as any)('file', 'OWN-1')).rejects.toThrow();
      expect(storage.delete).not.toHaveBeenCalled();
      expect(repo.remove).not.toHaveBeenCalled();
    },
  );
});
