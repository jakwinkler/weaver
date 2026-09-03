import type { ExecutionContext } from '@nestjs/common';
import { RateLimitingGuard } from './rate-limiting.guard';

function contextFor(path: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        originalUrl: path,
        url: path,
        headers: {},
        cookies: {},
        ip: '203.0.113.5',
      }),
    }),
    getHandler: () => contextFor,
    getClass: () => RateLimitingGuard,
  } as unknown as ExecutionContext;
}

describe('RateLimitingGuard availability behavior', () => {
  function createGuard(): RateLimitingGuard {
    return new RateLimitingGuard(
      { getAllAndOverride: jest.fn().mockReturnValue(undefined) } as never,
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
});
