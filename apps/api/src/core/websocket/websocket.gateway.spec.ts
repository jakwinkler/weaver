import { WeaverGateway } from './websocket.gateway';

describe('WeaverGateway project room isolation', () => {
  const membershipRepo = { findOne: jest.fn() };

  it('authorizes and scopes project subscriptions to the authenticated tenant', async () => {
    const projectAccess = { assertProjectKey: jest.fn().mockResolvedValue(undefined) };
    const gateway = new WeaverGateway(
      { verify: jest.fn() } as never,
      membershipRepo as never,
      projectAccess as never,
      { allowProjectJoin: jest.fn().mockResolvedValue(true) } as never,
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
      membershipRepo as never,
      projectAccess as never,
      { allowProjectJoin: jest.fn().mockResolvedValue(true) } as never,
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
      membershipRepo as never,
      {} as never,
      { allowProjectJoin: jest.fn().mockResolvedValue(true) } as never,
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

describe('project join abuse limits', () => {
  const setup = (allow = true) => {
    const access = { assertProjectKey: jest.fn().mockResolvedValue(undefined) };
    const limiter = { allowProjectJoin: jest.fn().mockResolvedValue(allow) };
    const gateway: WeaverGateway = Reflect.construct(WeaverGateway, [{}, {}, access, limiter]);
    const client = { id: 'socket', tenantId: 'tenant', tenantSchemaName: 'tenant_test', userId: 'user', role: 'member', join: jest.fn() };
    return { gateway, access, limiter, client };
  };
  it('bounds a socket burst before database authorization', async () => {
    const { gateway, access, client } = setup();
    await Promise.all(Array.from({ length: 50 }, () => gateway.handleJoinProject(client as never, { projectKey: 'DEMO' })));
    expect(access.assertProjectKey.mock.calls.length).toBeLessThanOrEqual(20);
  });
  it('rejects a user-wide budget denial before authorization', async () => {
    const { gateway, access, client } = setup(false);
    expect(await gateway.handleJoinProject(client as never, { projectKey: 'DEMO' })).toEqual({ joined: false });
    expect(access.assertProjectKey).not.toHaveBeenCalled();
  });
  it.each([42, 'x'.repeat(10000), {}, null])('rejects invalid project keys without database work', async projectKey => {
    const { gateway, access, client } = setup();
    expect(await gateway.handleJoinProject(client as never, { projectKey } as never)).toEqual({ joined: false });
    expect(access.assertProjectKey).not.toHaveBeenCalled();
  });
});

describe('socket sessions and password resets', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const userId = '22222222-2222-4222-8222-222222222222';

  function setup(tokenVersion: number | undefined, accountVersion: number) {
    const events: string[] = [];
    const jwt = {
      verify: jest.fn().mockReturnValue({
        sub: userId,
        email: 'owner@example.com',
        tenantId,
        role: 'owner',
        tokenType: 'access',
        sessionVersion: tokenVersion,
      }),
    };
    const membershipRepo = {
      findOne: jest.fn(async () => {
        events.push('read session');
        return {
          role: 'owner',
          tenant: { id: tenantId, schemaName: 'tenant_one' },
          user: { id: userId, sessionVersion: accountVersion },
        };
      }),
    };
    const gateway = new WeaverGateway(
      jwt as never,
      membershipRepo as never,
      {} as never,
      { allowProjectJoin: jest.fn() } as never,
    );
    const client = {
      id: 'socket-1',
      connected: true,
      handshake: { auth: { token: 'signed' }, headers: {} },
      join: jest.fn((room: string) => events.push(`join ${room}`)),
      disconnect: jest.fn(() => events.push('disconnect')),
    };
    return { gateway, client, membershipRepo, events };
  }

  it('accepts a token issued under the current version with one query', async () => {
    const { gateway, client, membershipRepo, events } = setup(3, 3);
    await gateway.handleConnection(client as never);

    expect(membershipRepo.findOne).toHaveBeenCalledTimes(1);
    expect(client.disconnect).not.toHaveBeenCalled();
    expect(events).toEqual([
      `join user:${userId}`,
      'read session',
      `join tenant:${tenantId}:user:${userId}`,
    ]);
    expect((client as Record<string, unknown>).tenantSchemaName).toBe('tenant_one');
  });

  it('refuses a token issued before the last password reset', async () => {
    const { gateway, client } = setup(undefined, 1);
    await gateway.handleConnection(client as never);

    expect(client.disconnect).toHaveBeenCalled();
    expect((client as Record<string, unknown>).userId).toBeUndefined();
  });

  it('is already in the account room when it reads the session, so a reset that commits after the read still reaches it', async () => {
    const { gateway, client, membershipRepo, events } = setup(0, 0);
    membershipRepo.findOne.mockImplementationOnce(async () => {
      events.push('read session');
      // The reset commits and disconnects the account's sockets here.
      client.connected = false;
      return {
        role: 'owner',
        tenant: { id: tenantId, schemaName: 'tenant_one' },
        user: { id: userId, sessionVersion: 0 },
      };
    });
    await gateway.handleConnection(client as never);

    expect(events).toEqual([`join user:${userId}`, 'read session']);
    expect((client as Record<string, unknown>).userId).toBeUndefined();
  });

  it('disconnects every socket the account has, in every organization', () => {
    const { gateway } = setup(0, 0);
    const disconnectSockets = jest.fn();
    const inRoom = jest.fn().mockReturnValue({ disconnectSockets });
    gateway.server = { in: inRoom } as never;

    gateway.disconnectUser(userId);

    expect(inRoom).toHaveBeenCalledWith(`user:${userId}`);
    expect(disconnectSockets).toHaveBeenCalledWith(true);
  });
});
