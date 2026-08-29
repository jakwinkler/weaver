import { z } from 'zod';

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

const scheduleTriggerSchema = z.object({
  type: z.literal('schedule'),
  cron: z.string().min(1).max(255),
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

export const createAutomationRuleSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(255),
  enabled: z.boolean().default(true),
  trigger: automationTriggerSchema,
  conditions: z.array(automationConditionSchema).default([]),
  actions: z.array(automationActionSchema).min(1).max(25),
});

export const updateAutomationRuleSchema = createAutomationRuleSchema.partial();

export type AutomationTrigger = z.infer<typeof automationTriggerSchema>;
export type AutomationCondition = z.infer<typeof automationConditionSchema>;
export type AutomationAction = z.infer<typeof automationActionSchema>;
export type CreateAutomationRuleDto = z.infer<typeof createAutomationRuleSchema>;
export type UpdateAutomationRuleDto = z.infer<typeof updateAutomationRuleSchema>;

export interface AutomationEventJobData {
  tenantId: string;
  schemaName: string;
  event: string;
  payload: Record<string, unknown>;
  depth: number;
  chainId: string;
}
