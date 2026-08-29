import { z } from 'zod';
import { parseExpression } from 'cron-parser';

export const NAMED_AUTOMATION_SCHEDULES = {
  daily_9am: '0 9 * * *',
  weekly_monday: '0 9 * * 1',
  hourly: '0 * * * *',
  every_15m: '*/15 * * * *',
} as const;

export type NamedAutomationSchedule = keyof typeof NAMED_AUTOMATION_SCHEDULES;

export const AUTOMATION_SETTABLE_FIELDS = [
  'summary',
  'description',
  'priority',
  'assigneeId',
  'labels',
  'parentId',
  'epicId',
  'sprintId',
  'customFields',
  'startDate',
  'dueDate',
  'percentDone',
] as const;

const eventTriggerSchema = z.object({
  type: z.enum([
    'issue.created',
    'issue.status_changed',
    'issue.assigned',
    'comment.created',
    'sprint.started',
    'sprint.completed',
  ]),
});

const issueUpdatedTriggerSchema = z.object({
  type: z.literal('issue.updated'),
  field: z.string().min(1).max(100).optional(),
});

const namedScheduleSchema = z.enum(['daily_9am', 'weekly_monday', 'hourly', 'every_15m']);

const scheduleTriggerSchema = z
  .object({
    type: z.literal('schedule'),
    schedule: namedScheduleSchema.optional(),
    cron: z.string().trim().min(1).max(255).optional(),
  })
  .strict()
  .superRefine((trigger, context) => {
    if (Boolean(trigger.schedule) === Boolean(trigger.cron)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Choose one named schedule or custom cron expression',
      });
      return;
    }

    const cron = trigger.schedule ? NAMED_AUTOMATION_SCHEDULES[trigger.schedule] : trigger.cron;
    if (!cron || cron.trim().split(/\s+/).length !== 5) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cron'],
        message: 'Cron expressions must contain five fields',
      });
      return;
    }
    try {
      parseExpression(cron, { tz: 'UTC' });
    } catch {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cron'],
        message: 'Invalid cron expression',
      });
    }
  });

export const automationProjectIdQuerySchema = z.string().uuid().optional();

export const automationTriggerSchema = z.union([
  issueUpdatedTriggerSchema,
  eventTriggerSchema,
  scheduleTriggerSchema,
]);

export const automationConditionSchema = z
  .discriminatedUnion('type', [
    z.object({
      type: z.literal('field_equals'),
      field: z.string().min(1).max(100),
      value: z.unknown(),
    }),
    z.object({
      type: z.literal('field_empty'),
      field: z.string().min(1).max(100),
    }),
    z.object({
      type: z.literal('field_not_equals'),
      field: z.string().min(1).max(100),
      value: z.unknown(),
    }),
    z.object({
      type: z.literal('field_contains'),
      field: z.string().min(1).max(100),
      value: z.unknown(),
    }),
    z.object({
      type: z.literal('status_category'),
      value: z.enum(['todo', 'in_progress', 'done']),
    }),
    z.object({
      type: z.literal('issue_type'),
      value: z.string().min(1).max(100),
    }),
    z.object({
      type: z.literal('query'),
      field: z.enum(['dueDate', 'startDate', 'createdAt', 'updatedAt']),
      operator: z.enum(['before', 'after']),
      value: z
        .string()
        .refine(
          (value) => value === 'now' || !Number.isNaN(Date.parse(value)),
          'Query value must be "now" or a valid date',
        ),
    }),
  ])
  .superRefine((condition, context) => {
    if (
      ['field_equals', 'field_not_equals', 'field_contains'].includes(condition.type) &&
      !Object.prototype.hasOwnProperty.call(condition, 'value')
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'Value is required',
      });
    }
  });

export const automationActionSchema = z
  .discriminatedUnion('type', [
    z.object({
      type: z.literal('set_field'),
      field: z.enum(AUTOMATION_SETTABLE_FIELDS),
      value: z.unknown(),
    }),
    z.object({
      type: z.literal('transition'),
      statusId: z.string().uuid(),
    }),
    z.object({
      type: z.literal('add_label'),
      label: z.string().min(1).max(100),
    }),
    z.object({
      type: z.literal('add_comment'),
      body: z.union([z.string().min(1).max(10_000), z.record(z.unknown())]),
    }),
    z.object({
      type: z.literal('send_notification'),
      userId: z.string().uuid(),
      title: z.string().min(1).max(255).optional(),
    }),
    z.object({
      type: z.literal('webhook'),
      url: z
        .string()
        .url()
        .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), {
          message: 'Webhook URL must use HTTP or HTTPS',
        }),
    }),
  ])
  .superRefine((action, context) => {
    if (action.type === 'set_field' && !Object.prototype.hasOwnProperty.call(action, 'value')) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'Value is required',
      });
    }
  });

const automationRuleFieldsSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(255),
  enabled: z.boolean().default(true),
  trigger: automationTriggerSchema,
  conditions: z.array(automationConditionSchema).default([]),
  actions: z.array(automationActionSchema).min(1).max(25),
});

function validateQueryConditionScope(
  rule: {
    trigger?: AutomationTrigger;
    conditions?: AutomationCondition[];
  },
  context: z.RefinementCtx,
): void {
  if (
    rule.trigger?.type !== 'schedule' &&
    rule.conditions?.some((condition) => condition.type === 'query')
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['conditions'],
      message: 'Query conditions are only available for scheduled rules',
    });
  }
}

export const createAutomationRuleSchema = automationRuleFieldsSchema.superRefine(
  validateQueryConditionScope,
);

export const updateAutomationRuleSchema = automationRuleFieldsSchema
  .partial()
  .superRefine(validateQueryConditionScope);

export type AutomationTrigger = z.infer<typeof automationTriggerSchema>;
export type AutomationCondition = z.infer<typeof automationConditionSchema>;
export type AutomationAction = z.infer<typeof automationActionSchema>;
export type CreateAutomationRuleDto = z.infer<typeof createAutomationRuleSchema>;
export type UpdateAutomationRuleDto = z.infer<typeof updateAutomationRuleSchema>;

export function cronForScheduleTrigger(
  trigger: Extract<AutomationTrigger, { type: 'schedule' }>,
): string {
  if (trigger.schedule) return NAMED_AUTOMATION_SCHEDULES[trigger.schedule];
  return trigger.cron as string;
}

export interface AutomationEventJobData {
  kind: 'event';
  tenantId: string;
  schemaName: string;
  event: string;
  payload: Record<string, unknown>;
  depth: number;
  chainId: string;
}

export interface ScheduledAutomationJobData {
  kind: 'schedule';
  tenantId: string;
  schemaName: string;
  ruleId: string;
  scheduledAt: string;
}

export type AutomationJobData = AutomationEventJobData | ScheduledAutomationJobData;
