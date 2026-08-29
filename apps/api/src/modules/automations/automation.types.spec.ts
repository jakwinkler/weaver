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

    for (const type of [
      'issue.created',
      'issue.status_changed',
      'issue.assigned',
      'comment.created',
      'sprint.started',
      'sprint.completed',
    ]) {
      expect(
        createAutomationRuleSchema.safeParse({
          name: `${type} rule`,
          trigger: { type },
          actions: [{ type: 'add_label', label: 'automated' }],
        }).success,
      ).toBe(true);
    }
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

  it('accepts the visual builder condition operators', () => {
    const result = createAutomationRuleSchema.safeParse({
      name: 'Builder conditions',
      trigger: { type: 'issue.created' },
      conditions: [
        { type: 'field_equals', field: 'priority', value: 'high' },
        { type: 'field_not_equals', field: 'assigneeId', value: 'user-1' },
        { type: 'field_empty', field: 'dueDate' },
        { type: 'field_contains', field: 'labels', value: 'urgent' },
      ],
      actions: [{ type: 'add_label', label: 'automated' }],
    });

    expect(result.success).toBe(true);
  });
});
