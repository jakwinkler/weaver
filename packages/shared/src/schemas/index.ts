import { z } from 'zod';
import {
  ISSUE_PRIORITIES,
  TENANT_PLANS,
  TENANT_ROLES,
  AUTH_PROVIDERS,
  BOARD_TYPES,
  BOARD_SWIMLANE_FIELDS,
  SPRINT_STATUSES,
  STATUS_CATEGORIES,
  ISSUE_LINK_TYPES,
  CUSTOM_FIELD_TYPES,
  API_KEY_SCOPES,
  PROJECT_KEY_REGEX,
  ISSUE_KEY_REGEX,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from '../constants';

// ── Auth Schemas ──

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(255),
  orgName: z.string().min(1).max(255),
  orgSlug: z
    .string()
    .min(2)
    .max(63)
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/),
});
export type RegisterDto = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginDto = z.infer<typeof loginSchema>;

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshTokenDto = z.infer<typeof refreshTokenSchema>;

export const selectOrganizationSchema = z.object({
  tenantId: z.string().uuid(),
});
export type SelectOrganizationDto = z.infer<typeof selectOrganizationSchema>;

export const createOAuthOrganizationSchema = z.object({
  orgName: z.string().min(1).max(255),
  orgSlug: z
    .string()
    .min(2)
    .max(63)
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/),
});
export type CreateOAuthOrganizationDto = z.infer<typeof createOAuthOrganizationSchema>;

export const createApiKeySchema = z.object({
  name: z.string().trim().min(1).max(255),
  scopes: z
    .array(z.enum(API_KEY_SCOPES))
    .min(1, 'Select at least one scope')
    .max(API_KEY_SCOPES.length)
    .refine((scopes) => new Set(scopes).size === scopes.length, {
      message: 'Scopes must be unique',
    }),
  expiresAt: z.coerce.date().nullable().optional(),
});
export type CreateApiKeyDto = z.infer<typeof createApiKeySchema>;

// ── User Schemas ──

export const updateUserSchema = z.object({
  displayName: z.string().min(1).max(255).optional(),
  avatarUrl: z.string().min(1).optional(),
});
export type UpdateUserDto = z.infer<typeof updateUserSchema>;

// ── Project Schemas ──

export const createProjectSchema = z.object({
  name: z.string().min(1).max(255),
  key: z
    .string()
    .regex(
      PROJECT_KEY_REGEX,
      'Project key must be 2-10 uppercase alphanumeric characters starting with a letter',
    ),
  description: z.string().max(5000).optional(),
});
export type CreateProjectDto = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).optional(),
  leadUserId: z.string().uuid().optional(),
  workflowId: z.string().uuid().optional(),
  iconAttachmentId: z.string().uuid().nullable().optional(),
  customFields: z.record(z.unknown()).optional(),
  visibility: z.enum(['private', 'public']).optional(),
});
export type UpdateProjectDto = z.infer<typeof updateProjectSchema>;

// ── Wiki Page Schemas ──

const emptyRichTextDocument = { type: 'doc', content: [] };

export const createPageSchema = z.object({
  title: z.string().trim().min(1).max(255),
  body: z.record(z.unknown()).default(emptyRichTextDocument),
  parentId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().optional(),
});
export type CreatePageDto = z.infer<typeof createPageSchema>;

export const updatePageSchema = z
  .object({
    title: z.string().trim().min(1).max(255).optional(),
    body: z.record(z.unknown()).optional(),
    parentId: z.string().uuid().nullable().optional(),
    sortOrder: z.number().int().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one page field is required',
  });
export type UpdatePageDto = z.infer<typeof updatePageSchema>;

// ── External Intake Form Schemas ──

export const formFieldSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-zA-Z0-9_-]+$/, 'Field ID contains invalid characters'),
    type: z.enum(['text', 'textarea', 'select', 'email']),
    label: z.string().trim().min(1).max(120),
    required: z.boolean().default(false),
    mapping: z.enum(['summary', 'description', 'labels', 'custom-field']),
    placeholder: z.string().max(200).optional(),
    options: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
    customFieldKey: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[a-zA-Z0-9_.-]+$/)
      .optional(),
  })
  .superRefine((field, ctx) => {
    if (field.type === 'select' && (!field.options || field.options.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['options'],
        message: 'Select fields require at least one option',
      });
    }
    if (field.mapping === 'custom-field' && !field.customFieldKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['customFieldKey'],
        message: 'Custom field mappings require a key',
      });
    }
  });

const formFieldsSchema = z
  .array(formFieldSchema)
  .min(1)
  .max(30)
  .superRefine((fields, ctx) => {
    const ids = new Set<string>();
    const singularMappings = new Set<string>();

    fields.forEach((field, index) => {
      if (ids.has(field.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, 'id'],
          message: 'Field IDs must be unique',
        });
      }
      ids.add(field.id);

      if (field.mapping !== 'custom-field') {
        if (singularMappings.has(field.mapping)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index, 'mapping'],
            message: `Only one field can map to ${field.mapping}`,
          });
        }
        singularMappings.add(field.mapping);
      }
    });

    if (!fields.some((field) => field.mapping === 'summary')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A form must include a field mapped to issue summary',
      });
    }
  });

export const formIssueDefaultsSchema = z.object({
  issueTypeId: z.string().uuid().optional(),
  priority: z.enum(ISSUE_PRIORITIES).optional(),
  labels: z.array(z.string().trim().min(1).max(50)).max(50).default([]),
});

const formSlugSchema = z
  .string()
  .min(2)
  .max(100)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Slug must contain lowercase letters, numbers, and single hyphens',
  );

export const createFormSchema = z.object({
  name: z.string().trim().min(1).max(255),
  slug: formSlugSchema,
  description: z.string().max(2000).nullable().optional(),
  fields: formFieldsSchema,
  issueDefaults: formIssueDefaultsSchema.default({ labels: [] }),
  active: z.boolean().default(true),
});
export type CreateFormDto = z.infer<typeof createFormSchema>;

export const updateFormSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  slug: formSlugSchema.optional(),
  description: z.string().max(2000).nullable().optional(),
  fields: formFieldsSchema.optional(),
  issueDefaults: formIssueDefaultsSchema.optional(),
  active: z.boolean().optional(),
});
export type UpdateFormDto = z.infer<typeof updateFormSchema>;

export const publicFormSubmissionSchema = z.object({
  values: z
    .record(z.string().max(10_000))
    .refine((values) => Object.keys(values).length <= 30, 'Too many submitted fields'),
  website: z.string().max(500).optional(),
  recaptchaToken: z.string().max(4096).optional(),
});
export type PublicFormSubmissionDto = z.infer<typeof publicFormSubmissionSchema>;

// ── Issue Schemas ──

const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

export const recurrenceRuleSchema = z
  .object({
    frequency: z.enum(['daily', 'weekly', 'monthly']),
    interval: z.number().int().min(1).max(365),
    daysOfWeek: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .max(7)
      .refine((days) => new Set(days).size === days.length, 'Days of week must be unique')
      .optional(),
    dayOfMonth: z.number().int().min(1).max(31).optional(),
    endDate: dateStringSchema.optional(),
    maxOccurrences: z.number().int().min(1).max(1000).optional(),
  })
  .strict()
  .superRefine((rule, ctx) => {
    if (rule.daysOfWeek && rule.frequency !== 'weekly') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['daysOfWeek'],
        message: 'Days of week are only valid for weekly recurrence',
      });
    }
    if (rule.dayOfMonth !== undefined && rule.frequency !== 'monthly') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dayOfMonth'],
        message: 'Day of month is only valid for monthly recurrence',
      });
    }
  });
export type RecurrenceRule = z.infer<typeof recurrenceRuleSchema>;

export const createIssueSchema = z.object({
  summary: z.string().min(1).max(500),
  description: z.record(z.unknown()).optional(),
  priority: z.enum(ISSUE_PRIORITIES).default('medium'),
  issueTypeId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
  labels: z.array(z.string()).default([]),
  parentId: z.string().uuid().optional(),
  epicId: z.string().uuid().optional(),
  customFields: z.record(z.unknown()).default({}),
  startDate: dateStringSchema.optional(),
  dueDate: dateStringSchema.optional(),
  percentDone: z.number().int().min(0).max(100).default(0),
  storyPoints: z.number().int().min(0).max(100).nullable().optional(),
  recurrenceRule: recurrenceRuleSchema.nullable().optional(),
});
export type CreateIssueDto = z.infer<typeof createIssueSchema>;

export const updateIssueSchema = z.object({
  summary: z.string().min(1).max(500).optional(),
  description: z.record(z.unknown()).nullable().optional(),
  priority: z.enum(ISSUE_PRIORITIES).optional(),
  statusId: z.string().uuid().optional(),
  sprintId: z.string().uuid().nullable().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  labels: z.array(z.string()).optional(),
  parentId: z.string().uuid().nullable().optional(),
  epicId: z.string().uuid().nullable().optional(),
  customFields: z.record(z.unknown()).optional(),
  sortOrder: z.number().optional(),
  startDate: dateStringSchema.nullable().optional(),
  dueDate: dateStringSchema.nullable().optional(),
  percentDone: z.number().int().min(0).max(100).optional(),
  storyPoints: z.number().int().min(0).max(100).nullable().optional(),
  recurrenceRule: recurrenceRuleSchema.nullable().optional(),
});
export type UpdateIssueDto = z.infer<typeof updateIssueSchema>;

export const bulkIssueUpdatesSchema = updateIssueSchema
  .pick({
    statusId: true,
    assigneeId: true,
    priority: true,
    sprintId: true,
    labels: true,
  })
  .refine((updates) => Object.keys(updates).length > 0, {
    message: 'At least one bulk update field is required',
  });
export type BulkIssueUpdatesDto = z.infer<typeof bulkIssueUpdatesSchema>;

const bulkIssueIdsSchema = z
  .array(z.string().uuid())
  .min(1, 'At least one issue is required')
  .max(100, 'Bulk operations are limited to 100 issues');

export const bulkUpdateIssuesSchema = z.object({
  issueIds: bulkIssueIdsSchema,
  updates: bulkIssueUpdatesSchema,
});
export type BulkUpdateIssuesDto = z.infer<typeof bulkUpdateIssuesSchema>;

export const bulkDeleteIssuesSchema = z.object({
  issueIds: bulkIssueIdsSchema,
});
export type BulkDeleteIssuesDto = z.infer<typeof bulkDeleteIssuesSchema>;

export const moveIssueSprintSchema = z.object({
  sprintId: z.string().uuid().nullable(),
  sortOrder: z.number().int().min(0).optional(),
});
export type MoveIssueSprintDto = z.infer<typeof moveIssueSprintSchema>;

export const reorderIssuesSchema = z.object({
  issues: z
    .array(
      z.object({
        id: z.string().uuid(),
        sortOrder: z.number().int().min(0),
      }),
    )
    .min(1)
    .max(200),
});
export type ReorderIssuesDto = z.infer<typeof reorderIssuesSchema>;

export const issueKeySchema = z
  .string()
  .regex(ISSUE_KEY_REGEX, 'Invalid issue key format (e.g., WEB-123)');

// ── Pagination ──

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  sort: z.string().optional(),
});
export type PaginationDto = z.infer<typeof paginationSchema>;

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}

// ── Workflow Schemas ──

export const createWorkflowSchema = z.object({
  name: z.string().min(1).max(255),
  isDefault: z.boolean().default(false),
});
export type CreateWorkflowDto = z.infer<typeof createWorkflowSchema>;

export const createWorkflowStatusSchema = z.object({
  name: z.string().min(1).max(100),
  category: z.enum(STATUS_CATEGORIES),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  isInitial: z.boolean().default(false),
  isTerminal: z.boolean().default(false),
  position: z.number().int().min(0).default(0),
});
export type CreateWorkflowStatusDto = z.infer<typeof createWorkflowStatusSchema>;

export const createWorkflowTransitionSchema = z.object({
  fromStatusId: z.string().uuid(),
  toStatusId: z.string().uuid(),
  name: z.string().min(1).max(255),
  conditions: z.array(z.record(z.unknown())).default([]),
  validators: z.array(z.record(z.unknown())).default([]),
  postFunctions: z.array(z.record(z.unknown())).default([]),
});
export type CreateWorkflowTransitionDto = z.infer<typeof createWorkflowTransitionSchema>;

// ── Comment Schema ──

export const createCommentSchema = z.object({
  body: z.record(z.unknown()),
});
export type CreateCommentDto = z.infer<typeof createCommentSchema>;

// ── Board Schema ──

export const boardConfigSchema = z
  .object({
    swimlaneField: z.enum(BOARD_SWIMLANE_FIELDS).optional(),
    wipLimits: z.record(z.string().uuid(), z.number().int().min(1).max(9999)).optional(),
  })
  .strict();
export type BoardConfigDto = z.infer<typeof boardConfigSchema>;

export const createBoardSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(BOARD_TYPES),
  config: boardConfigSchema.default({}),
});
export type CreateBoardDto = z.infer<typeof createBoardSchema>;

export const updateBoardSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  type: z.enum(BOARD_TYPES).optional(),
  config: boardConfigSchema.optional(),
});
export type UpdateBoardDto = z.infer<typeof updateBoardSchema>;

// ── Sprint Schema ──

export const createSprintSchema = z.object({
  name: z.string().min(1).max(255),
  goal: z.string().max(1000).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  capacity: z.number().int().min(0).max(10000).nullable().optional(),
});
export type CreateSprintDto = z.infer<typeof createSprintSchema>;

// ── Webhook Schema ──

export const createWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string()).min(1),
  projectId: z.string().uuid().optional(),
});
export type CreateWebhookDto = z.infer<typeof createWebhookSchema>;

// ── Time Entry Schema ──

export const createTimeEntrySchema = z.object({
  minutes: z.number().int().min(1),
  description: z.string().max(500).optional(),
  loggedAt: z.coerce.date().optional(),
});
export type CreateTimeEntryDto = z.infer<typeof createTimeEntrySchema>;

// ── Tenant Settings Schema ──

export const smtpSettingsSchema = z.object({
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  user: z.string().max(255),
  pass: z.string().max(255),
  fromName: z.string().min(1).max(255),
  fromEmail: z.string().email(),
});

export const ssoSettingsSchema = z.object({
  google: z.object({
    enabled: z.boolean(),
  }),
  github: z.object({
    enabled: z.boolean(),
  }),
  saml: z.object({
    enabled: z.boolean(),
    idpUrl: z.string().max(2048),
    cert: z.string().max(20000),
  }),
  oidc: z.object({
    enabled: z.boolean(),
    discoveryUrl: z.string().max(2048),
    clientId: z.string().max(1024),
    clientSecret: z.string().max(4096),
  }),
});

export const updateTenantSettingsSchema = z.object({
  timezone: z.string().min(1).max(100).optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
  allowedDomains: z.array(z.string().min(1).max(255)).optional(),
  smtp: smtpSettingsSchema.nullable().optional(),
  sso: ssoSettingsSchema.optional(),
});
export type UpdateTenantSettingsDto = z.infer<typeof updateTenantSettingsSchema>;

export const testSmtpSettingsSchema = z
  .object({
    smtp: smtpSettingsSchema.optional(),
  })
  .strict();

// ── Notification Preferences Schema ──

export const notificationPreferencesSchema = z
  .object({
    emailOnAssign: z.boolean().default(true),
    emailOnMention: z.boolean().default(true),
    emailOnComment: z.boolean().default(true),
    emailOnStatusChange: z.boolean().default(true),
  })
  .strict();

export const updateNotificationPreferencesSchema = notificationPreferencesSchema.partial().strict();
export type UpdateNotificationPreferencesDto = z.infer<typeof updateNotificationPreferencesSchema>;
