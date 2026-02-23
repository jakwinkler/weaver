import { z } from 'zod';
import {
  ISSUE_PRIORITIES,
  TENANT_PLANS,
  TENANT_ROLES,
  AUTH_PROVIDERS,
  BOARD_TYPES,
  SPRINT_STATUSES,
  STATUS_CATEGORIES,
  ISSUE_LINK_TYPES,
  CUSTOM_FIELD_TYPES,
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

// ── User Schemas ──

export const updateUserSchema = z.object({
  displayName: z.string().min(1).max(255).optional(),
  avatarUrl: z.string().url().optional(),
});
export type UpdateUserDto = z.infer<typeof updateUserSchema>;

// ── Project Schemas ──

export const createProjectSchema = z.object({
  name: z.string().min(1).max(255),
  key: z.string().regex(PROJECT_KEY_REGEX, 'Project key must be 2-10 uppercase alphanumeric characters starting with a letter'),
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
});
export type UpdateProjectDto = z.infer<typeof updateProjectSchema>;

// ── Issue Schemas ──

const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

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
});
export type CreateIssueDto = z.infer<typeof createIssueSchema>;

export const updateIssueSchema = z.object({
  summary: z.string().min(1).max(500).optional(),
  description: z.record(z.unknown()).optional(),
  priority: z.enum(ISSUE_PRIORITIES).optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  labels: z.array(z.string()).optional(),
  parentId: z.string().uuid().nullable().optional(),
  epicId: z.string().uuid().nullable().optional(),
  customFields: z.record(z.unknown()).optional(),
  sortOrder: z.number().optional(),
  startDate: dateStringSchema.nullable().optional(),
  dueDate: dateStringSchema.nullable().optional(),
  percentDone: z.number().int().min(0).max(100).optional(),
});
export type UpdateIssueDto = z.infer<typeof updateIssueSchema>;

export const issueKeySchema = z.string().regex(ISSUE_KEY_REGEX, 'Invalid issue key format (e.g., WEB-123)');

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

export const createBoardSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(BOARD_TYPES),
  config: z.record(z.unknown()).default({}),
});
export type CreateBoardDto = z.infer<typeof createBoardSchema>;

// ── Sprint Schema ──

export const createSprintSchema = z.object({
  name: z.string().min(1).max(255),
  goal: z.string().max(1000).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
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
