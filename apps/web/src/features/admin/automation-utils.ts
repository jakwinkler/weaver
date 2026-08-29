import type {
  AutomationAction,
  AutomationCondition,
  AutomationRuleInput,
  AutomationSettableField,
  AutomationTrigger,
} from '@/api';

export const TRIGGER_OPTIONS = [
  {
    value: 'issue.created',
    category: 'Issue',
    label: 'Issue created',
    description: 'Runs whenever a new issue is created.',
  },
  {
    value: 'issue.updated',
    category: 'Issue',
    label: 'Issue updated',
    description: 'Runs when any issue field, or a selected field, changes.',
  },
  {
    value: 'issue.status_changed',
    category: 'Issue',
    label: 'Issue transitioned',
    description: 'Runs after an issue moves to a different status.',
  },
  {
    value: 'issue.assigned',
    category: 'Issue',
    label: 'Issue assigned',
    description: 'Runs when an issue assignee changes.',
  },
  {
    value: 'comment.created',
    category: 'Issue',
    label: 'Issue commented',
    description: 'Runs when a new comment is added to an issue.',
  },
  {
    value: 'sprint.started',
    category: 'Sprint',
    label: 'Sprint started',
    description: 'Runs when a planned sprint becomes active.',
  },
  {
    value: 'sprint.completed',
    category: 'Sprint',
    label: 'Sprint completed',
    description: 'Runs when an active sprint is completed.',
  },
  {
    value: 'schedule.daily',
    category: 'Schedule',
    label: 'Daily at 9:00 AM UTC',
    description: 'Runs once each day using a fixed UTC schedule.',
  },
  {
    value: 'schedule.weekly',
    category: 'Schedule',
    label: 'Weekly, Monday at 9:00 AM UTC',
    description: 'Runs once each Monday using a fixed UTC schedule.',
  },
  {
    value: 'schedule.custom',
    category: 'Schedule',
    label: 'Custom cron schedule',
    description: 'Runs on the UTC cron expression you provide.',
  },
] as const;

export type TriggerOptionValue = (typeof TRIGGER_OPTIONS)[number]['value'];

export const CONDITION_FIELDS = [
  { value: 'priority', label: 'Priority' },
  { value: 'assigneeId', label: 'Assignee' },
  { value: 'statusId', label: 'Status' },
  { value: 'statusCategory', label: 'Status category' },
  { value: 'issueType', label: 'Issue type' },
  { value: 'labels', label: 'Labels' },
  { value: 'summary', label: 'Summary' },
  { value: 'dueDate', label: 'Due date' },
] as const;

export type AutomationConditionField = (typeof CONDITION_FIELDS)[number]['value'];
export type AutomationConditionOperator = 'equals' | 'not_equals' | 'empty' | 'contains';

export const ACTION_TYPES = [
  { value: 'set_field', label: 'Set issue field' },
  { value: 'transition', label: 'Transition issue' },
  { value: 'add_label', label: 'Add label' },
  { value: 'add_comment', label: 'Add comment' },
  { value: 'send_notification', label: 'Send notification' },
  { value: 'webhook', label: 'Send webhook' },
] as const;

export const SET_FIELD_OPTIONS: Array<{ value: AutomationSettableField; label: string }> = [
  { value: 'summary', label: 'Summary' },
  { value: 'priority', label: 'Priority' },
  { value: 'assigneeId', label: 'Assignee' },
  { value: 'labels', label: 'Labels' },
  { value: 'startDate', label: 'Start date' },
  { value: 'dueDate', label: 'Due date' },
  { value: 'percentDone', label: 'Percent done' },
];

export function triggerOptionValue(trigger: AutomationTrigger): TriggerOptionValue {
  if (trigger.type !== 'schedule') return trigger.type;
  if (trigger.cron === '0 9 * * *') return 'schedule.daily';
  if (trigger.cron === '0 9 * * 1') return 'schedule.weekly';
  return 'schedule.custom';
}

export function triggerFromOption(
  value: TriggerOptionValue,
  current: AutomationTrigger,
): AutomationTrigger {
  if (value === 'schedule.daily') return { type: 'schedule', cron: '0 9 * * *' };
  if (value === 'schedule.weekly') return { type: 'schedule', cron: '0 9 * * 1' };
  if (value === 'schedule.custom') {
    return {
      type: 'schedule',
      cron: current.type === 'schedule' ? current.cron : '0 9 * * 1-5',
    };
  }
  if (value === 'issue.updated') return { type: value };
  return { type: value };
}

export function describeTrigger(trigger: AutomationTrigger): string {
  if (trigger.type === 'schedule') {
    if (trigger.cron === '0 9 * * *') return 'Every day at 9:00 AM UTC';
    if (trigger.cron === '0 9 * * 1') return 'Every Monday at 9:00 AM UTC';
    return `Schedule: ${trigger.cron}`;
  }
  if (trigger.type === 'issue.updated' && trigger.field) {
    const label = CONDITION_FIELDS.find((field) => field.value === trigger.field)?.label;
    return `${label ?? trigger.field} changes`;
  }
  return TRIGGER_OPTIONS.find((option) => option.value === trigger.type)?.label ?? trigger.type;
}

export function conditionField(condition: AutomationCondition): AutomationConditionField {
  if (condition.type === 'status_category') return 'statusCategory';
  if (condition.type === 'issue_type') return 'issueType';
  return condition.field as AutomationConditionField;
}

export function conditionOperator(condition: AutomationCondition): AutomationConditionOperator {
  switch (condition.type) {
    case 'field_not_equals':
      return 'not_equals';
    case 'field_empty':
      return 'empty';
    case 'field_contains':
      return 'contains';
    default:
      return 'equals';
  }
}

export function conditionValue(condition: AutomationCondition): unknown {
  if (condition.type === 'field_empty') return '';
  return condition.value;
}

export function makeCondition(
  field: AutomationConditionField,
  operator: AutomationConditionOperator,
  value: unknown = '',
): AutomationCondition {
  if (operator === 'empty') {
    const fallbackField = field === 'statusCategory' || field === 'issueType' ? 'summary' : field;
    return { type: 'field_empty', field: fallbackField };
  }
  if (field === 'statusCategory') {
    return {
      type: 'status_category',
      value: (value || 'todo') as 'todo' | 'in_progress' | 'done',
    };
  }
  if (field === 'issueType') return { type: 'issue_type', value: String(value) };
  if (operator === 'not_equals') return { type: 'field_not_equals', field, value };
  if (operator === 'contains') return { type: 'field_contains', field, value };
  return { type: 'field_equals', field, value };
}

export function createDefaultCondition(): AutomationCondition {
  return { type: 'field_equals', field: 'priority', value: 'high' };
}

export function createDefaultAction(
  type: AutomationAction['type'] = 'add_label',
): AutomationAction {
  switch (type) {
    case 'set_field':
      return { type, field: 'priority', value: 'high' };
    case 'transition':
      return { type, statusId: '' };
    case 'add_comment':
      return { type, body: '' };
    case 'send_notification':
      return { type, userId: '' };
    case 'webhook':
      return { type, url: '' };
    case 'add_label':
      return { type, label: '' };
  }
}

export function defaultSetFieldValue(field: AutomationSettableField): unknown {
  if (field === 'priority') return 'medium';
  if (field === 'labels') return [];
  if (field === 'percentDone') return 0;
  return '';
}

export function setFieldValueFromInput(field: AutomationSettableField, value: string): unknown {
  if (field === 'labels') {
    return value
      .split(',')
      .map((label) => label.trim())
      .filter(Boolean);
  }
  if (field === 'percentDone') return Number(value);
  return value;
}

export function setFieldInputValue(
  action: Extract<AutomationAction, { type: 'set_field' }>,
): string {
  if (Array.isArray(action.value)) return action.value.join(', ');
  return action.value == null ? '' : String(action.value);
}

export function describeCondition(condition: AutomationCondition): string {
  const field = CONDITION_FIELDS.find(
    (option) => option.value === conditionField(condition),
  )?.label;
  const operatorLabels: Record<AutomationConditionOperator, string> = {
    equals: 'equals',
    not_equals: 'does not equal',
    empty: 'is empty',
    contains: 'contains',
  };
  const operator = conditionOperator(condition);
  const value = conditionValue(condition);
  return operator === 'empty'
    ? `${field ?? 'Field'} ${operatorLabels[operator]}`
    : `${field ?? 'Field'} ${operatorLabels[operator]} ${String(value)}`;
}

export function describeAction(action: AutomationAction): string {
  switch (action.type) {
    case 'set_field':
      return `Set ${SET_FIELD_OPTIONS.find((field) => field.value === action.field)?.label ?? action.field} to ${setFieldInputValue(action)}`;
    case 'transition':
      return 'Transition the issue to the selected status';
    case 'add_label':
      return `Add label “${action.label}”`;
    case 'add_comment':
      return `Add comment “${typeof action.body === 'string' ? action.body : 'Rich text comment'}”`;
    case 'send_notification':
      return action.title ? `Send notification “${action.title}”` : 'Send a notification';
    case 'webhook':
      return `Send a webhook to ${action.url}`;
  }
}

export function reorderActions(
  actions: AutomationAction[],
  fromIndex: number,
  toIndex: number,
): AutomationAction[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= actions.length ||
    toIndex >= actions.length
  ) {
    return actions;
  }
  const next = [...actions];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function validateAutomationStep(input: AutomationRuleInput, step: number): string[] {
  const errors: string[] = [];
  if (step === 0) {
    if (!input.name.trim()) errors.push('Give this rule a name.');
    if (input.trigger.type === 'schedule' && !input.trigger.cron.trim()) {
      errors.push('Enter a cron schedule.');
    }
  }
  if (step === 1) {
    input.conditions.forEach((condition, index) => {
      if (condition.type !== 'field_empty' && String(conditionValue(condition)).trim() === '') {
        errors.push(`Condition ${index + 1} needs a value.`);
      }
    });
  }
  if (step === 2) {
    if (input.actions.length === 0) errors.push('Add at least one action.');
    input.actions.forEach((action, index) => {
      const value =
        action.type === 'set_field'
          ? action.value
          : action.type === 'transition'
            ? action.statusId
            : action.type === 'add_label'
              ? action.label
              : action.type === 'add_comment'
                ? action.body
                : action.type === 'send_notification'
                  ? action.userId
                  : action.url;
      if (value == null || (typeof value === 'string' && !value.trim())) {
        errors.push(`Action ${index + 1} is incomplete.`);
      }
      if (
        action.type === 'set_field' &&
        action.field === 'percentDone' &&
        (typeof action.value !== 'number' || action.value < 0 || action.value > 100)
      ) {
        errors.push(`Action ${index + 1} needs a percentage from 0 to 100.`);
      }
      if (action.type === 'webhook') {
        try {
          const url = new URL(action.url);
          if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported protocol');
        } catch {
          errors.push(`Action ${index + 1} needs a valid HTTP or HTTPS URL.`);
        }
      }
    });
  }
  return errors;
}
