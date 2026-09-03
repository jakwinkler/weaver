import { WeaverGateway } from './websocket.gateway';

describe('WeaverGateway project room isolation', () => {
  const tenantRepo = { findOneBy: jest.fn() };
  const membershipRepo = { findOneBy: jest.fn() };

  it('authorizes and scopes project subscriptions to the authenticated tenant', async () => {
    const projectAccess = { assertProjectKey: jest.fn().mockResolvedValue(undefined) };
    const gateway = new WeaverGateway(
      { verify: jest.fn() } as never,
      tenantRepo as never,
      membershipRepo as never,
      projectAccess as never,
    );
    const client = {
      id: 'socket-a',
      tenantId: 'tenant-a',
      tenantSchemaName: 'tenant_a',
      userId: 'user-a',
      role: 'member',
      join: jest.fn(),
      leave: jest.fn(),
    };
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    gateway.server = { to } as never;

    const result = await gateway.handleJoinProject(client as never, { projectKey: 'SHARED' });
    gateway.handleLeaveProject(client as never, { projectKey: 'SHARED' });
    gateway.emitToProject('tenant-b', 'SHARED', 'issue.created', { id: 'issue-b' });

    expect(projectAccess.assertProjectKey).toHaveBeenCalledWith(
      'SHARED',
      expect.objectContaining({ userId: 'user-a', tenantId: 'tenant-a', role: 'member' }),
      'read',
    );
    expect(client.join).toHaveBeenCalledWith('tenant:tenant-a:project:SHARED');
    expect(result).toEqual({ joined: true, projectKey: 'SHARED' });
    expect(client.leave).toHaveBeenCalledWith('tenant:tenant-a:project:SHARED');
    expect(to).toHaveBeenCalledWith('tenant:tenant-b:project:SHARED');
    expect(emit).toHaveBeenCalledWith('issue.created', { id: 'issue-b' });
  });

  it('does not join a project room when membership authorization fails', async () => {
    const projectAccess = {
      assertProjectKey: jest.fn().mockRejectedValue(new Error('forbidden')),
    };
    const gateway = new WeaverGateway(
      { verify: jest.fn() } as never,
      tenantRepo as never,
      membershipRepo as never,
      projectAccess as never,
    );
    const client = {
      id: 'socket-b',
      tenantId: 'tenant-a',
      tenantSchemaName: 'tenant_a',
      userId: 'user-b',
      role: 'member',
      join: jest.fn(),
    };

    const result = await gateway.handleJoinProject(client as never, { projectKey: 'PRIVATE' });

    expect(client.join).not.toHaveBeenCalled();
    expect(result).toEqual({ joined: false });
  });

  it('disconnects an active socket after its tenant role changes', () => {
    const gateway = new WeaverGateway(
      { verify: jest.fn() } as never,
      tenantRepo as never,
      membershipRepo as never,
      {} as never,
    );
    const disconnectSockets = jest.fn();
    const inRoom = jest.fn().mockReturnValue({ disconnectSockets });
    gateway.server = {
      in: inRoom,
    } as never;

    gateway.disconnectUserFromTenant('user-a', 'tenant-a');

    expect(inRoom).toHaveBeenCalledWith('tenant:tenant-a:user:user-a');
    expect(disconnectSockets).toHaveBeenCalledWith(true);
  });
});
