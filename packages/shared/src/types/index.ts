import type {
  IssuePriority,
  StatusCategory,
  BoardType,
  BoardSwimlaneField,
  SprintStatus,
  TenantPlan,
  TenantRole,
  AuthProvider,
  IssueLinkType,
  CustomFieldType,
  ApiKeyScope,
} from '../constants';
import type { RecurrenceRule } from '../schemas';

export * from './import';

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
  authProviders: AuthProvider[];
  avatarUrl?: string;
  notificationPreferences?: NotificationPreferences;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthResponse<TUser = User> {
  accessToken: string;
  refreshToken: string;
  user: TUser;
  tenantId: string;
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
  | 'comment-added'
  | 'form-submission';

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
  name: string;
  maskedKey: string;
  scopes: ApiKeyScope[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface CreatedApiKey extends ApiKey {
  key: string;
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

export interface Page {
  id: string;
  projectId: string;
  title: string;
  slug: string;
  body: Record<string, unknown>;
  parentId: string | null;
  sortOrder: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PageTreeNode {
  id: string;
  title: string;
  slug: string;
  parentId: string | null;
  sortOrder: number;
  children: PageTreeNode[];
}

export interface PageVersion {
  id: string;
  pageId: string;
  title: string;
  slug: string;
  body: Record<string, unknown>;
  parentId: string | null;
  sortOrder: number;
  createdBy: string;
  authorDisplayName: string;
  createdAt: Date;
}

export type FormFieldType = 'text' | 'textarea' | 'select' | 'email';

export type FormFieldMapping = 'summary' | 'description' | 'labels' | 'custom-field';

export interface FormFieldDefinition {
  id: string;
  type: FormFieldType;
  label: string;
  required: boolean;
  mapping: FormFieldMapping;
  placeholder?: string;
  options?: string[];
  customFieldKey?: string;
}

export interface FormIssueDefaults {
  issueTypeId?: string;
  priority?: IssuePriority;
  labels: string[];
}

export interface Form {
  id: string;
  projectId: string;
  name: string;
  slug: string;
  description?: string | null;
  fields: FormFieldDefinition[];
  issueDefaults: FormIssueDefaults;
  active: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  tenantSlug?: string;
}

export interface PublicForm {
  name: string;
  description?: string | null;
  fields: FormFieldDefinition[];
  captchaSiteKey?: string;
}

export interface FormSubmission {
  id: string;
  formId: string;
  issueId?: string | null;
  issueKey: string;
  submittedAt: Date;
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
  sso: {
    google: {
      enabled: boolean;
    };
    github: {
      enabled: boolean;
    };
    saml: {
      enabled: boolean;
      idpUrl: string;
      cert: string;
    };
    oidc: {
      enabled: boolean;
      discoveryUrl: string;
      clientId: string;
      clientSecret: string;
    };
  };
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
  storyPoints?: number | null;
  recurrenceRule: RecurrenceRule | null;
  recurrenceParentId: string | null;
  recurrenceOccurrence: number;
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

export interface RoadmapStatus {
  id: string;
  name: string;
  category: string;
  color: string;
  isTerminal: boolean;
}

export interface RoadmapEpicChild {
  id: string;
  key: string;
  summary: string;
  statusId: string;
  status: RoadmapStatus;
  startDate: string | null;
  dueDate: string | null;
  storyPoints: number | null;
}

export interface RoadmapEpic {
  id: string;
  key: string;
  summary: string;
  statusId: string;
  status: RoadmapStatus;
  startDate: string | null;
  dueDate: string | null;
  childIssueCount: number;
  completedChildCount: number;
  totalStoryPoints: number;
  completedStoryPoints: number;
  progress: number;
  pointsProgress: number;
  blockingEpicIds: string[];
  children: RoadmapEpicChild[];
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
  config: BoardConfig;
  createdAt: Date;
}

export interface BoardConfig {
  swimlaneField?: BoardSwimlaneField;
  wipLimits?: Record<string, number>;
}

export interface BoardIssueGroup<TIssue = Issue> {
  key: string;
  value: string | null;
  label: string;
  issues: TIssue[];
}

export interface BoardIssuesResponse<TIssue = Issue, TBoard = Board> {
  board: TBoard;
  issues: TIssue[];
  groups: BoardIssueGroup<TIssue>[];
  columnPointTotals: Record<string, number>;
}

export interface Sprint {
  id: string;
  projectId: string;
  name: string;
  goal?: string;
  startDate?: Date | string;
  endDate?: Date | string;
  status: SprintStatus;
  capacity?: number | null;
  initialScope?: SprintInitialScope | null;
  createdAt: Date;
}

export interface SprintScopeIssue {
  issueId: string;
  storyPoints: number;
  statusId: string;
}

export interface SprintInitialScope {
  capturedAt: string;
  issues: SprintScopeIssue[];
}

export interface SprintStats {
  sprintId: string;
  capacity: number | null;
  committedPoints: number;
  issueCount: number;
  completedCount: number;
  completedPoints: number;
}

export interface BurndownDataPoint {
  date: string;
  totalPoints: number;
  remainingPoints: number;
  idealRemaining: number;
}

export interface SprintReportDates {
  startDate: string | null;
  endDate: string | null;
}

export interface SprintSummary {
  sprintId: string;
  sprintName: string;
  dates: SprintReportDates;
  totalIssues: number;
  completedIssues: number;
  addedMidSprint: number;
  removedMidSprint: number;
  totalPointsCommitted: number;
  completedPoints: number;
  carryOverPoints: number;
  completionPercentage: number;
}

export interface SprintVelocity {
  sprintId: string;
  sprintName: string;
  committedPoints: number;
  completedPoints: number;
  dates: SprintReportDates;
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

export interface AuditLogUser {
  id: string;
  displayName: string;
  email: string;
}

export interface AuditLog {
  id: string;
  userId: string | null;
  user: AuditLogUser | null;
  action: string;
  resource: string;
  resourceId: string;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
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

export interface WebhookDeliveryJobData {
  tenantId: string;
  schemaName: string;
  webhookId: string;
  eventType: string;
  payload: Record<string, unknown>;
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
  description: string | null;
  loggedAt: Date;
  startedAt: Date | null;
  endedAt: Date | null;
  source: 'manual' | 'timer' | 'plugin';
  sourcePluginId: string | null;
  sourceReference: string | null;
  lockedAt: Date | null;
  lockReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}
