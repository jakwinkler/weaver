import { TenantMiddleware } from './tenant.middleware';
import { getTenantContext } from './tenant.context';
import { API_KEY_PREFIX } from '@weaver/shared';
import { currentSessionVersion } from '../auth/session-version';

const membershipSession = (sessionVersion = 0) => ({
  role: 'member',
  tenant: { id: '11111111-1111-4111-8111-111111111111', schemaName: 'tenant_one', slug: 'acme' },
  user: { id: '22222222-2222-4222-8222-222222222222', sessionVersion },
});

describe('API key tenant binding', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const userId = '22222222-2222-4222-8222-222222222222';
  function fixture() {
    const keyRepo = { findOneBy: jest.fn().mockResolvedValue({ tenantId, userId, expiresAt: null }) };
    const middleware = new (TenantMiddleware as any)(
      // A password reset raised the account's version; API keys are not tied to it.
      { findOne: jest.fn().mockResolvedValue(membershipSession(4)) },
      { verifyAsync: jest.fn().mockRejectedValue(new Error('not JWT')) },
      keyRepo,
    );
    return { middleware, keyRepo };
  }
  const request = (headers = {}) => ({ originalUrl: '/api/v1/projects', headers: { authorization: `Bearer ${API_KEY_PREFIX}test`, ...headers } });
  it('establishes request-scoped context from a valid API key', async () => {
    const { middleware, keyRepo } = fixture();
    let context: unknown;
    await middleware.use(request(), {}, () => { context = getTenantContext(); });
    expect(keyRepo.findOneBy).toHaveBeenCalled();
    expect(context).toEqual({ tenantId, schemaName: 'tenant_one', slug: 'acme' });
  });
  it('rejects a conflicting tenant header', async () => {
    await expect(fixture().middleware.use(request({ 'x-tenant-id': userId }), {}, jest.fn())).rejects.toThrow('does not match');
  });
  it('rejects an expired API key', async () => {
    const { middleware, keyRepo } = fixture();
    keyRepo.findOneBy.mockResolvedValue({ tenantId, userId, expiresAt: new Date(0) } as never);
    await expect(middleware.use(request(), {}, jest.fn())).rejects.toThrow('expired');
  });
});

describe('TenantMiddleware route classification', () => {
  it('does not treat a plugin route containing auth as a core auth route', async () => {
    const membershipRepo = {
      findOne: jest.fn().mockResolvedValue(membershipSession()),
    };
    const jwt = {
      verifyAsync: jest.fn().mockResolvedValue({
        sub: '22222222-2222-4222-8222-222222222222',
        tenantId: '11111111-1111-4111-8111-111111111111',
        tokenType: 'access',
      }),
    };
    const middleware = new TenantMiddleware(
      membershipRepo as never,
      jwt as never,
      {} as never,
    );
    const next = jest.fn();

    await middleware.use({
      originalUrl: '/api/v1/plugin-routes/example/auth/callback',
      headers: { authorization: 'Bearer token' },
      cookies: {},
    } as never, {} as never, next);

    expect(membershipRepo.findOne).toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});

describe('TenantMiddleware session version', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const userId = '22222222-2222-4222-8222-222222222222';

  function fixture(tokenVersion: number | undefined, accountVersion: number) {
    const membershipRepo = { findOne: jest.fn().mockResolvedValue(membershipSession(accountVersion)) };
    const payload = { sub: userId, tenantId, tokenType: 'access', sessionVersion: tokenVersion };
    const middleware = new TenantMiddleware(
      membershipRepo as never,
      { verifyAsync: jest.fn().mockResolvedValue(payload) } as never,
      {} as never,
    );
    const req = {
      originalUrl: '/api/v1/projects',
      headers: { authorization: 'Bearer token' },
      cookies: {},
    } as Record<string, unknown>;
    return { middleware, membershipRepo, req };
  }

  it('reads membership, tenant, and session version in one query', async () => {
    const { middleware, membershipRepo, req } = fixture(2, 2);
    let context: unknown;
    await middleware.use(req as never, {} as never, () => { context = getTenantContext(); });

    expect(membershipRepo.findOne).toHaveBeenCalledTimes(1);
    expect(membershipRepo.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId, userId },
      relations: { tenant: true, user: true },
      select: expect.objectContaining({ tenant: { id: true, schemaName: true, slug: true } }),
    }));
    expect(context).toEqual({ tenantId, schemaName: 'tenant_one', slug: 'acme' });
    expect(req.tenantMembershipRole).toBe('member');
  });

  it('counts a token without a version as version 0', async () => {
    const { middleware, req } = fixture(undefined, 0);
    let context: unknown;
    await middleware.use(req as never, {} as never, () => { context = getTenantContext(); });
    expect(context).toEqual({ tenantId, schemaName: 'tenant_one', slug: 'acme' });
  });

  it('gives a token from before a password reset no tenant context, like an expired one', async () => {
    const { middleware, req } = fixture(0, 1);
    let context: unknown = 'not called';
    await middleware.use(req as never, {} as never, () => { context = getTenantContext(); });

    expect(context).toBeUndefined();
    expect(req.tenantMembershipRole).toBeUndefined();
  });

  it('leaves the version it read for the auth guard, so the request needs no second query', async () => {
    const { middleware, req } = fixture(0, 1);
    await middleware.use(req as never, {} as never, jest.fn());
    const users = { findOne: jest.fn() };

    await expect(currentSessionVersion(req, userId, users as never)).resolves.toBe(1);
    expect(users.findOne).not.toHaveBeenCalled();
  });
});
