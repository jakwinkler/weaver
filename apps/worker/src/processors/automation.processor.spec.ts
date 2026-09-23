import { describe, expect, it, vi } from 'vitest';
import { createScheduledAutomationProcessor } from './automation.processor';

describe('scheduled automation processor', () => {
  it('delegates cron-fired jobs to the automation engine queue', async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    const processor = createScheduledAutomationProcessor({ add });

    await processor({
      data: {
        tenantId: 'tenant-1',
        schemaName: 'tenant_one',
        ruleId: 'rule-1',
      },
      processedOn: 1_788_000_000_000,
    } as never);

    expect(add).toHaveBeenCalledWith(
      'evaluate-schedule',
      {
        kind: 'schedule',
        tenantId: 'tenant-1',
        schemaName: 'tenant_one',
        ruleId: 'rule-1',
        scheduledAt: new Date(1_788_000_000_000).toISOString(),
      },
      { removeOnComplete: true, removeOnFail: 100 },
    );
  });
});
