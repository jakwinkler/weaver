import { RolesService } from './roles.service';

describe('delegated role management', () => {
  it.each([
    [{ name: 'delegated' }, { permissions: { 'issues.read': true } }],
    [{ name: 'other' }, { permissions: { '*': true } }],
    [{ name: 'other' }, { permissions: { 'admin.manage_plugins': true } }],
    [{ name: 'other' }, { name: 'admin' }],
  ])('prevents a delegated manager from escalating roles', async (target, dto) => {
    const repo = { findOneBy: jest.fn().mockResolvedValue(target), save: jest.fn() };
    const service = new RolesService({
      getEntityManager: async () => ({ getRepository: () => repo }),
    } as any);
    await expect(
      (service.update as any)('id', dto, { userId: 'u', role: 'delegated' }),
    ).rejects.toThrow();
    expect(repo.save).not.toHaveBeenCalled();
  });
});
