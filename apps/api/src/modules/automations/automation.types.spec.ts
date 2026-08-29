import { createAutomationRuleSchema, updateAutomationRuleSchema } from './automation.types';

describe('automation schemas', () => {
  it('accepts event and schedule trigger variants', () => {
    const eventRule = createAutomationRuleSchema.parse({
      name: 'Event rule',
      trigger: { type: 'issue.updated', field: 'assigneeId' },
      actions: [{ type: 'add_label', label: 'assigned' }],
    });
    const scheduleRule = createAutomationRuleSchema.parse({
      name: 'Schedule rule',
      trigger: { type: 'schedule', cron: '0 9 * * 1-5' },
      actions: [
        {
          type: 'send_notification',
          userId: '00000000-0000-4000-8000-000000000001',
        },
      ],
    });

    expect(eventRule.trigger).toEqual({
      type: 'issue.updated',
      field: 'assigneeId',
    });
    expect(scheduleRule.trigger.type).toBe('schedule');
  });

  it('requires actions and values for field comparisons and updates', () => {
    expect(
      createAutomationRuleSchema.safeParse({
        name: 'No actions',
        trigger: { type: 'issue.created' },
        actions: [],
      }).success,
    ).toBe(false);
    expect(
      createAutomationRuleSchema.safeParse({
        name: 'Missing values',
        trigger: { type: 'issue.created' },
        conditions: [{ type: 'field_equals', field: 'priority' }],
        actions: [{ type: 'set_field', field: 'priority' }],
      }).success,
    ).toBe(false);
  });

  it('validates partial updates without materializing create defaults', () => {
    expect(updateAutomationRuleSchema.parse({ enabled: false })).toEqual({
      enabled: false,
    });
  });
});
