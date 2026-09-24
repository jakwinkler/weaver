import { ProjectMembersService } from './project-members.service';
import { tenantStorage } from '../../core/tenant';

it('rejects a foreign tenant user before adding project membership', async () => {
  const repo = { findOneBy: jest.fn().mockResolvedValue(null), create: jest.fn(), save: jest.fn() };
  const em = { getRepository: () => repo, query: jest.fn().mockResolvedValue([]) };
  const service = new ProjectMembersService({ getEntityManager: async () => em } as any);
  await tenantStorage.run({ tenantId: 'tenant-1', schemaName: 'tenant_one' }, async () => {
    await expect(service.add('project-1', 'foreign-user', 'member')).rejects.toThrow();
    expect(repo.save).not.toHaveBeenCalled();
  });
});
