import { ForbiddenException } from '@nestjs/common';
import { PermissionService } from './permission.service';
import type { RequestUser } from './current-user.decorator';

describe('PermissionService', () => {
  function serviceWithRoles(roles: Record<string, Record<string, boolean>>) {
    const findOneBy = jest.fn(async ({ name }: { name: string }) =>
      roles[name] ? { name, permissions: roles[name] } : null,
    );
    const connections = { getEntityManager: async () => ({ getRepository: () => ({ findOneBy }) }) };
    return { service: new PermissionService(connections as never), findOneBy };
  }
  const user = (role: string) => ({ userId: 'u1', email: 'u1@example.com', tenantId: 't1', role }) as RequestUser;
  const transitionAndAssign = [
    { category: 'issues', action: 'transition' },
    { category: 'issues', action: 'assign' },
  ];

  it('lets owners through without reading roles', async () => {
    const { service, findOneBy } = serviceWithRoles({});
    await expect(service.assertPermissions(user('owner'), transitionAndAssign)).resolves.toBeUndefined();
    expect(findOneBy).not.toHaveBeenCalled();
  });

  it('honors the wildcard permission', async () => {
    const { service } = serviceWithRoles({ admin: { '*': true } });
    await expect(service.assertPermissions(user('admin'), transitionAndAssign)).resolves.toBeUndefined();
  });

  it('requires every listed permission and names the first missing one', async () => {
    const { service } = serviceWithRoles({ editor: { 'issues.transition': true } });
    await expect(service.assertPermissions(user('editor'), transitionAndAssign))
      .rejects.toThrow(new ForbiddenException('Missing permission: issues.assign'));
  });

  it('skips the role lookup when nothing is required', async () => {
    const { service, findOneBy } = serviceWithRoles({});
    await expect(service.assertPermissions(user('editor'), [])).resolves.toBeUndefined();
    expect(findOneBy).not.toHaveBeenCalled();
  });

  it('rejects unknown roles and missing users', async () => {
    const { service } = serviceWithRoles({});
    await expect(service.assertPermissions(user('ghost'), transitionAndAssign)).rejects.toThrow('Role not found');
    await expect(service.assertPermissions(undefined, transitionAndAssign)).rejects.toThrow('Authentication required');
  });
});
