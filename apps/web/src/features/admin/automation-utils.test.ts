import { describe, expect, it } from 'vitest';
import type { AutomationRuleInput, AutomationTrigger } from '@/api';
import {
  describeTrigger,
  makeCondition,
  reorderActions,
  triggerFromOption,
  triggerOptionValue,
  validateAutomationStep,
} from './automation-utils';

describe('automation builder utilities', () => {
  it('maps schedule presets without losing custom cron expressions', () => {
    const custom: AutomationTrigger = { type: 'schedule', cron: '15 14 * * 2' };
    expect(triggerOptionValue({ type: 'schedule', cron: '0 9 * * *' })).toBe('schedule.daily');
    expect(triggerOptionValue({ type: 'schedule', cron: '0 9 * * 1' })).toBe('schedule.weekly');
    expect(triggerOptionValue(custom)).toBe('schedule.custom');
    expect(triggerFromOption('schedule.custom', custom)).toEqual(custom);
    expect(describeTrigger(custom)).toBe('Schedule: 15 14 * * 2');
  });

  it('builds each visual condition operator in the API format', () => {
    expect(makeCondition('priority', 'equals', 'high')).toEqual({
      type: 'field_equals',
      field: 'priority',
      value: 'high',
    });
    expect(makeCondition('priority', 'not_equals', 'low')).toEqual({
      type: 'field_not_equals',
      field: 'priority',
      value: 'low',
    });
    expect(makeCondition('labels', 'contains', 'urgent')).toEqual({
      type: 'field_contains',
      field: 'labels',
      value: 'urgent',
    });
    expect(makeCondition('assigneeId', 'empty')).toEqual({
      type: 'field_empty',
      field: 'assigneeId',
    });
  });

  it('reorders actions immutably and ignores invalid moves', () => {
    const actions = [
      { type: 'add_label' as const, label: 'first' },
      { type: 'add_comment' as const, body: 'second' },
      { type: 'webhook' as const, url: 'https://example.com' },
    ];
    expect(reorderActions(actions, 0, 2).map((action) => action.type)).toEqual([
      'add_comment',
      'webhook',
      'add_label',
    ]);
    expect(reorderActions(actions, -1, 2)).toBe(actions);
  });

  it('validates each builder step before review', () => {
    const input: AutomationRuleInput = {
      projectId: null,
      name: '',
      enabled: true,
      trigger: { type: 'issue.created' },
      conditions: [{ type: 'field_contains', field: 'summary', value: '' }],
      actions: [{ type: 'webhook', url: 'ftp://example.com' }],
    };

    expect(validateAutomationStep(input, 0)).toEqual(['Give this rule a name.']);
    expect(validateAutomationStep(input, 1)).toEqual(['Condition 1 needs a value.']);
    expect(validateAutomationStep(input, 2)).toEqual(['Action 1 needs a valid HTTP or HTTPS URL.']);
  });
});
