import { Reflector } from '@nestjs/core';
import { RateLimitingGuard } from './rate-limiting.guard';

describe('RateLimitingGuard lifecycle', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('releases its cleanup interval when the application shuts down', () => {
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
    const guard = new RateLimitingGuard(new Reflector());

    guard.onModuleDestroy();

    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
  });
});
