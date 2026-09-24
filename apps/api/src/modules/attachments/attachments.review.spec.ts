import { AttachmentsService } from './attachments.service';
import { AttachmentsController } from './attachments.controller';

describe('attachment deletion route binding', () => {
  it.each(['other-issue', null])(
    'does not delete an attachment belonging to %s',
    async (issueId) => {
      const storage = { delete: jest.fn() };
      const repo = {
        remove: jest.fn(),
        findOneBy: jest.fn().mockResolvedValue({ id: 'route-issue' }),
      };
      const service = new AttachmentsService(
        { getEntityManager: async () => ({ getRepository: () => repo }) } as any,
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
