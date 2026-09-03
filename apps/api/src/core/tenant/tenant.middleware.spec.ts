import { TenantMiddleware } from './tenant.middleware';

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
