import type {
  IssuePriority,
  StatusCategory,
  BoardType,
  SprintStatus,
  TenantPlan,
  TenantRole,
  AuthProvider,
  IssueLinkType,
  CustomFieldType,
} from '../constants';

// ── Public Schema Types ──

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  schemaName: string;
  plan: TenantPlan;
  settings: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  passwordHash?: string;
  authProvider: AuthProvider;
  avatarUrl?: string;
  notificationPreferences?: NotificationPreferences;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationPreferences {
  emailOnAssign: boolean;
  emailOnMention: boolean;
  emailOnComment: boolean;
  emailOnStatusChange: boolean;
}

export type NotificationPreferenceKey = keyof NotificationPreferences;

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  emailOnAssign: true,
  emailOnMention: true,
  emailOnComment: true,
  emailOnStatusChange: true,
};

export type EmailTemplateName =
  | 'issue-assigned'
  | 'mentioned-in-comment'
  | 'issue-status-changed'
  | 'comment-added';

export interface EmailNotificationJobData {
  type: 'email';
  userId: string;
  tenantId: string;
  to: string;
  title: string;
  body: string;
  html: string;
  headers: Record<string, string>;
  data?: Record<string, unknown>;
}

export interface InAppNotificationJobData {
  type: 'in_app';
  userId: string;
  tenantId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export type NotificationJobData = EmailNotificationJobData | InAppNotificationJobData;

export interface TenantMembership {
  tenantId: string;
  userId: string;
  role: TenantRole;
  createdAt: Date;
}

export interface ApiKey {
  id: string;
  tenantId: string;
  userId: string;
  name: string;
  keyHash: string;
  scopes: string[];
  expiresAt?: Date;
  lastUsedAt?: Date;
  createdAt: Date;
}

export interface InstalledPlugin {
  id: string;
  tenantId: string;
  pluginId: string;
  version: string;
  enabled: boolean;
  settings: Record<string, unknown>;
  installedAt: Date;
}

// ── Tenant Schema Types ──

export interface Project {
  id: string;
  key: string;
  name: string;
  description?: string;
  workflowId?: string;
  leadUserId?: string;
  iconAttachmentId?: string | null;
  issueCounter: number;
  customFields: Record<string, unknown>;
  visibility: 'private' | 'public';
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantSettings {
  timezone: string;
  theme: 'light' | 'dark' | 'system';
  allowedDomains: string[];
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    fromName: string;
    fromEmail: string;
  } | null;
}

export interface Issue {
  id: string;
  projectId: string;
  key: string;
  summary: string;
  description?: Record<string, unknown> | null;
  statusId: string;
  issueTypeId?: string;
  priority: IssuePriority;
  assigneeId?: string;
  reporterId: string;
  customFields: Record<string, unknown>;
  sprintId?: string | null;
  parentId?: string;
  epicId?: string;
  labels: string[];
  sortOrder: number;
  startDate?: string;
  dueDate?: string;
  percentDone: number;
  createdAt: Date;
  updatedAt: Date;
  issueType?: IssueType | null;
}

export interface IssueType {
  id: string;
  name: string;
  slug: string;
  icon?: string;
  iconColor?: string | null;
  iconAttachmentId?: string | null;
  isSubtask: boolean;
  createdAt: Date;
}

export interface IssueLink {
  id: string;
  linkType: IssueLinkType;
  sourceIssueId: string;
  targetIssueId: string;
  createdAt: Date;
}

export interface Workflow {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowStatus {
  id: string;
  workflowId: string;
  name: string;
  category: StatusCategory;
  color: string;
  isInitial: boolean;
  isTerminal: boolean;
  position: number;
}

export interface WorkflowTransition {
  id: string;
  workflowId: string;
  fromStatusId: string;
  toStatusId: string;
  name: string;
  conditions: Record<string, unknown>[];
  validators: Record<string, unknown>[];
  postFunctions: Record<string, unknown>[];
}

export interface Board {
  id: string;
  projectId: string;
  name: string;
  type: BoardType;
  config: Record<string, unknown>;
  createdAt: Date;
}

export interface Sprint {
  id: string;
  projectId: string;
  name: string;
  goal?: string;
  startDate?: Date;
  endDate?: Date;
  status: SprintStatus;
  createdAt: Date;
}

export interface Comment {
  id: string;
  issueId: string;
  authorId: string;
  authorDisplayName?: string;
  authorEmail?: string;
  authorAvatarUrl?: string | null;
  body: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Attachment {
  id: string;
  issueId: string;
  uploaderId: string;
  filename: string;
  mimeType: string;
  size: number;
  storageKey: string;
  createdAt: Date;
}

export interface ActivityLog {
  id: string;
  issueId: string;
  userId: string;
  userDisplayName?: string;
  userEmail?: string;
  userAvatarUrl?: string | null;
  action: string;
  fieldName?: string;
  oldValue?: string;
  newValue?: string;
  createdAt: Date;
}

export interface Role {
  id: string;
  name: string;
  permissions: Record<string, boolean>;
  isSystem: boolean;
  createdAt: Date;
}

export interface CustomFieldDefinition {
  id: string;
  name: string;
  slug: string;
  fieldType: CustomFieldType;
  options?: Record<string, unknown>;
  validation?: Record<string, unknown>;
  required: boolean;
  createdAt: Date;
}

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  data: Record<string, unknown>;
  isRead: boolean;
  createdAt: Date;
}

export interface Webhook {
  id: string;
  projectId?: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  createdAt: Date;
}

export interface SavedFilter {
  id: string;
  name: string;
  ownerId: string;
  query: string;
  isShared: boolean;
  createdAt: Date;
}

export interface TimeEntry {
  id: string;
  issueId: string;
  userId: string;
  minutes: number;
  description?: string;
  loggedAt: Date;
  createdAt: Date;
}
