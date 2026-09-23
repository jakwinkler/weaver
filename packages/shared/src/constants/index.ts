export const ISSUE_PRIORITIES = ['lowest', 'low', 'medium', 'high', 'highest'] as const;
export type IssuePriority = (typeof ISSUE_PRIORITIES)[number];

export const STATUS_CATEGORIES = ['todo', 'in_progress', 'done'] as const;
export type StatusCategory = (typeof STATUS_CATEGORIES)[number];

export const BOARD_TYPES = ['kanban', 'scrum'] as const;
export type BoardType = (typeof BOARD_TYPES)[number];

export const BOARD_SWIMLANE_FIELDS = ['none', 'assignee', 'priority', 'epic'] as const;
export type BoardSwimlaneField = (typeof BOARD_SWIMLANE_FIELDS)[number];

export const SPRINT_STATUSES = ['planned', 'active', 'completed'] as const;
export type SprintStatus = (typeof SPRINT_STATUSES)[number];

export const TENANT_PLANS = ['free', 'pro', 'enterprise'] as const;
export type TenantPlan = (typeof TENANT_PLANS)[number];

export const TENANT_ROLES = ['owner', 'admin', 'member', 'viewer'] as const;
export type TenantRole = (typeof TENANT_ROLES)[number];

export const AUTH_PROVIDERS = ['local', 'google', 'github', 'saml', 'oidc'] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

export const ISSUE_LINK_TYPES = [
  'blocks',
  'is_blocked_by',
  'relates_to',
  'duplicates',
  'is_duplicated_by',
  'causes',
  'is_caused_by',
  'clones',
  'is_cloned_from',
] as const;
export type IssueLinkType = (typeof ISSUE_LINK_TYPES)[number];

export const CUSTOM_FIELD_TYPES = [
  'text',
  'number',
  'select',
  'multi_select',
  'date',
  'user',
  'checkbox',
  'url',
] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export const API_KEY_PREFIX = 'wvr_';
export const API_KEY_SCOPES = ['read', 'write', 'admin'] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

export const PROJECT_KEY_REGEX = /^[A-Z][A-Z0-9]{1,9}$/;
export const ISSUE_KEY_REGEX = /^[A-Z][A-Z0-9]{1,9}-\d+$/;
