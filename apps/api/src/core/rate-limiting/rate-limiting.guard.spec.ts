import type { ExecutionContext } from '@nestjs/common';
import { createHash } from 'crypto';
import { RateLimitingGuard } from './rate-limiting.guard';

function contextFor(path: string, body?: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        originalUrl: path,
        url: path,
        headers: {},
        cookies: {},
        ip: '203.0.113.5',
        body,
      }),
    }),
    getHandler: () => contextFor,
    getClass: () => RateLimitingGuard,
  } as unknown as ExecutionContext;
}

describe('RateLimitingGuard availability behavior', () => {
  function createGuard(meta?: { limit: number; windowMs: number }): RateLimitingGuard {
    return new RateLimitingGuard(
      { getAllAndOverride: jest.fn().mockReturnValue(meta) } as never,
      { get: jest.fn((_key: string, fallback: unknown) => fallback) } as never,
      { verifyAsync: jest.fn() } as never,
    );
  }

  it('fails open when Redis is unavailable', async () => {
    const guard = createGuard();
    (guard as any).redis = { status: 'end' };

    await expect(guard.canActivate(contextFor('/api/v1/projects'))).resolves.toBe(true);
  });

  it('never consults Redis for the health endpoint', async () => {
    const guard = createGuard();
    const evalCommand = jest.fn();
    (guard as any).redis = { status: 'ready', eval: evalCommand };

    await expect(guard.canActivate(contextFor('/api/v1/health'))).resolves.toBe(true);
    expect(evalCommand).not.toHaveBeenCalled();
  });

  it.each([
    '/api/v1/auth/login',
    '/api/v1/auth/password-reset/request',
    '/api/v1/auth/password-reset/confirm',
    '/api/v1/public/acme/forms/support',
  ])('fails closed for %s during a Redis outage', async (path) => {
    const guard = createGuard();
    (guard as any).redis = { status: 'end' };
    await expect(guard.canActivate(contextFor(path))).rejects.toMatchObject({ status: 503 });
  });

  it('counts password reset requests per client address and per email address', async () => {
    const guard = createGuard({ limit: 5, windowMs: 900_000 });
    const evalCommand = jest.fn().mockResolvedValueOnce([1, 900_000]).mockResolvedValueOnce([6, 800_000]);
    (guard as any).redis = { status: 'ready', eval: evalCommand };

    await expect(
      guard.canActivate(contextFor('/api/v1/auth/password-reset/request', { email: ' Owner@Example.com ' })),
    ).rejects.toMatchObject({ status: 429 });
    expect(evalCommand.mock.calls[0][2]).toBe('weaver:rate-limit:5:900000:ip:203.0.113.5');
    const accountHash = createHash('sha256').update('owner@example.com').digest('hex');
    expect(evalCommand.mock.calls[1][2]).toBe(`weaver:rate-limit:auth-account:5:900000:${accountHash}`);
  });

  it('skips counting only the exact sign-in provider route', async () => {
    const guard = createGuard();
    const evalCommand = jest.fn().mockResolvedValue([1, 60_000]);
    (guard as any).redis = { status: 'ready', eval: evalCommand };
    await expect(guard.canActivate(contextFor('/api/v1/auth/providers'))).resolves.toBe(true);
    expect(evalCommand).not.toHaveBeenCalled();
    await expect(guard.canActivate(contextFor('/api/v1/plugin-routes/x/auth/providers'))).resolves.toBe(true);
    expect(evalCommand).toHaveBeenCalledTimes(1);
  });

  it('consumes named budgets and fails closed without Redis', async () => {
    const guard = createGuard();
    const evalCommand = jest.fn().mockResolvedValueOnce([5, 1000]).mockResolvedValueOnce([6, 900]);
    (guard as any).redis = { status: 'ready', eval: evalCommand };
    await expect(guard.consume('password-reset-confirm:user-1', 5, 1000)).resolves.toBe(true);
    await expect(guard.consume('password-reset-confirm:user-1', 5, 1000)).resolves.toBe(false);
    expect(evalCommand.mock.calls[0][2]).toBe('weaver:rate-limit:password-reset-confirm:user-1');

    (guard as any).redis = { status: 'end' };
    await expect(guard.consume('password-reset-confirm:user-1', 5, 1000)).rejects.toMatchObject({ status: 503 });
  });
});
