/** Standard domain events that plugins can subscribe to */
export const WEAVER_EVENTS = {
  ISSUE_CREATED: 'issue.created',
  ISSUE_UPDATED: 'issue.updated',
  ISSUE_DELETED: 'issue.deleted',
  ISSUE_STATUS_CHANGED: 'issue.status_changed',
  ISSUE_ASSIGNED: 'issue.assigned',
  ISSUE_MOVED: 'issue.moved',
  ISSUE_SPRINT_CHANGED: 'issue.sprint_changed',
  ISSUE_REORDERED: 'issue.reordered',
  ISSUE_BULK_UPDATED: 'issue.bulk_updated',
  ISSUE_BULK_DELETED: 'issue.bulk_deleted',
  COMMENT_CREATED: 'comment.created',
  /**
   * @deprecated Use COMMENT_CREATED. The API has never emitted `comment.added`; new comments
   * send `comment.created`. A manifest subscription to `comment.added` receives `comment.created`.
   */
  COMMENT_ADDED: 'comment.created',
  COMMENT_UPDATED: 'comment.updated',
  COMMENT_DELETED: 'comment.deleted',
  SPRINT_CREATED: 'sprint.created',
  SPRINT_UPDATED: 'sprint.updated',
  SPRINT_STARTED: 'sprint.started',
  SPRINT_COMPLETED: 'sprint.completed',
  SPRINT_DELETED: 'sprint.deleted',
  PROJECT_CREATED: 'project.created',
  PROJECT_UPDATED: 'project.updated',
  /** @deprecated The API does not emit a `project.deleted` event. */
  PROJECT_DELETED: 'project.deleted',
  TIME_LOGGED: 'time.logged',
  TIME_UPDATED: 'time.updated',
  TIME_DELETED: 'time.deleted',
} as const;

export type WeaverEventType = typeof WEAVER_EVENTS[keyof typeof WEAVER_EVENTS];

export interface WeaverEvent<T = unknown> {
  type: WeaverEventType | string;
  tenantId: string;
  userId?: string;
  timestamp: string;
  data: T;
}

export interface IssueCreatedEvent {
  issueKey: string;
  projectKey: string;
  summary: string;
  priority: string;
  assigneeId?: string | null;
  userId: string;
}

export interface IssueStatusChangedEvent {
  issueKey: string;
  projectKey: string;
  fromStatus: string;
  toStatus: string;
  /** Omitted for changes made without a signed-in user, such as some automations. */
  userId?: string;
}

/** Sent with issue.status_changed or issue.sprint_changed. */
export interface IssueMovedEvent {
  issueKey: string;
  projectKey: string;
  fromStatus: string;
  toStatus: string;
  /** Omitted when the issue moved through a workflow transition. */
  fromSprint?: string | null;
  toSprint?: string | null;
  userId: string | null;
}

export interface IssueSprintChangedEvent {
  issueKey: string;
  projectKey: string;
  fromSprint: string | null;
  toSprint: string | null;
  sortOrder: number;
  userId?: string;
}

export interface IssueReorderedEvent {
  projectKey: string;
  issueKeys: string[];
  userId: string;
}

/** Sent once per project for PATCH /issues/bulk and for POST /sprints/:id/issues. */
export interface IssueBulkUpdatedEvent {
  updates: Record<string, unknown>;
  userId: string;
  projectKey: string;
  projectKeys: string[];
  issueIds: string[];
  issueKeys: string[];
  count: number;
}

export type IssueBulkDeletedEvent = Omit<IssueBulkUpdatedEvent, 'updates'>;

/** Payload of comment.created, comment.updated, and comment.deleted. */
export interface CommentCreatedEvent {
  commentId: string;
  issueKey: string;
  projectKey: string;
  userId: string | null;
}

/** @deprecated Use CommentCreatedEvent. The API sends `userId`, not `authorId`. */
export interface CommentAddedEvent {
  issueKey: string;
  commentId: string;
  authorId: string;
}

export interface IssueUpdatedEvent {
  issueKey: string;
  projectKey: string;
  fields: Record<string, unknown>;
  userId: string | null;
}

export interface IssueAssignedEvent {
  issueKey: string;
  projectKey: string;
  assigneeId: string | null;
  previousAssigneeId: string | null;
  userId: string | null;
}

export interface IssueDeletedEvent {
  issueKey: string;
  projectKey: string;
  userId: string;
}

export interface ProjectCreatedEvent {
  projectKey: string;
  name: string;
  leadUserId: string;
  userId: string;
}

export interface ProjectUpdatedEvent {
  projectKey: string;
  fields: Record<string, unknown>;
  userId: string;
}

/** Payload of every sprint.* event. */
export interface SprintEvent {
  sprintId: string;
  projectId: string;
  projectKey: string;
  name: string;
  userId: string | null;
}

export interface TimeLoggedEvent {
  /** Present for entries a plugin creates. */
  entryId?: string;
  issueKey: string;
  projectKey: string;
  minutes: number;
  description?: string;
  userId: string;
  /** The next three are present for entries a plugin creates. */
  source?: 'plugin';
  sourcePluginId?: string;
  sourceReference?: string | null;
}

/** Payload of time.updated and time.deleted. */
export interface TimeEntryChangedEvent {
  entryId: string;
  /** Omitted only when the entry's issue could not be found. */
  issueKey?: string;
  projectKey?: string;
  userId: string;
  /** Present when a plugin changed the entry. */
  sourcePluginId?: string;
}
