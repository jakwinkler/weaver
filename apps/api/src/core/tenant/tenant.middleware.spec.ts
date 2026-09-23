import { TenantMiddleware } from './tenant.middleware';
import { getTenantContext } from './tenant.context';
import { API_KEY_PREFIX } from '@weaver/shared';

describe('API key tenant binding', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const userId = '22222222-2222-4222-8222-222222222222';
  function fixture() {
    const keyRepo = { findOneBy: jest.fn().mockResolvedValue({ tenantId, userId, expiresAt: null }) };
    const middleware = new (TenantMiddleware as any)(
      { findOneBy: jest.fn().mockResolvedValue({ id: tenantId, schemaName: 'tenant_one' }) },
      { findOneBy: jest.fn().mockResolvedValue({ role: 'member' }) },
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
    expect(context).toEqual({ tenantId, schemaName: 'tenant_one' });
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
    const tenantRepo = {
      findOneBy: jest.fn().mockResolvedValue({
        id: '11111111-1111-4111-8111-111111111111',
        schemaName: 'tenant_one',
      }),
    };
    const membershipRepo = {
      findOneBy: jest.fn().mockResolvedValue({ role: 'member' }),
    };
    const jwt = {
      verifyAsync: jest.fn().mockResolvedValue({
        sub: '22222222-2222-4222-8222-222222222222',
        tenantId: '11111111-1111-4111-8111-111111111111',
        tokenType: 'access',
      }),
    };
    const middleware = new TenantMiddleware(
      tenantRepo as never,
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

    expect(membershipRepo.findOneBy).toHaveBeenCalled();
    expect(tenantRepo.findOneBy).toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});
