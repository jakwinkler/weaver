import { describe, it, expect } from 'vitest';
import { config } from '../src/config';

describe('Worker Config', () => {
  it('should have redis configuration', () => {
    expect(config.redis).toBeDefined();
    expect(config.redis.host).toBeDefined();
    expect(config.redis.port).toBeGreaterThan(0);
  });

  it('should define all queue configurations', () => {
    expect(config.queues.events.name).toBe('events');
    expect(config.queues.events.concurrency).toBe(10);
    expect(config.queues.webhooks.name).toBe('webhooks');
    expect(config.queues.webhooks.concurrency).toBe(5);
    expect(config.queues.notifications.name).toBe('notifications');
    expect(config.queues.notifications.concurrency).toBe(10);
    expect(config.queues.scmSync.name).toBe('scm-sync');
    expect(config.queues.scmSync.concurrency).toBe(3);
    expect(config.queues.tenantOps.name).toBe('tenant-ops');
    expect(config.queues.tenantOps.concurrency).toBe(1);
  });
});
