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

describe('imported attachment metadata visibility', () => {
  it('does not load or expose source media identities for hidden files', async () => {
    const archive = {
      findOneBy: jest.fn().mockResolvedValue({ payload: { mediaId: 'private-media-id' } }),
    };
    const files = {
      find: jest
        .fn()
        .mockResolvedValue([{ sourceId: 'source-file', visibility: { type: 'admin' } }]),
    };
    const manager = {
      getRepository: (entity: any) =>
        entity.name === 'IssueEntity'
          ? { findOneBy: async () => ({ id: 'issue' }) }
          : entity.name === 'AttachmentEntity'
            ? files
            : archive,
    };
    const service = new AttachmentsService(
      { getEntityManager: async () => manager } as any,
      {} as any,
    );
    expect(await service.findByIssue('EPD-251', { userId: 'reader', role: 'viewer' })).toEqual([]);
    expect(archive.findOneBy).not.toHaveBeenCalled();
  });
  it('returns the media identity for an authorized file using its issue and source ID', async () => {
    const archive = {
      findOneBy: jest.fn().mockResolvedValue({ payload: { mediaId: 'allowed-media-id' } }),
    };
    const files = {
      find: jest
        .fn()
        .mockResolvedValue([
          { id: 'file', sourceId: 'source-file', visibility: { type: 'admin' } },
        ]),
    };
    const manager = {
      getRepository: (entity: any) =>
        entity.name === 'IssueEntity'
          ? { findOneBy: async () => ({ id: 'issue' }) }
          : entity.name === 'AttachmentEntity'
            ? files
            : archive,
    };
    const service = new AttachmentsService(
      { getEntityManager: async () => manager } as any,
      {} as any,
    );
    const result = await service.findByIssue('EPD-251', { userId: 'operator', role: 'owner' });
    expect(result[0].sourceMediaId).toBe('allowed-media-id');
    expect(archive.findOneBy).toHaveBeenCalledWith({
      kind: 'attachment',
      externalId: 'source-file',
      issueId: 'issue',
    });
  });
});
