/** Standard domain events that plugins can subscribe to */
export const WEAVER_EVENTS = {
  ISSUE_CREATED: 'issue.created',
  ISSUE_UPDATED: 'issue.updated',
  ISSUE_DELETED: 'issue.deleted',
  ISSUE_STATUS_CHANGED: 'issue.status_changed',
  ISSUE_ASSIGNED: 'issue.assigned',
  COMMENT_ADDED: 'comment.added',
  COMMENT_UPDATED: 'comment.updated',
  COMMENT_DELETED: 'comment.deleted',
  SPRINT_STARTED: 'sprint.started',
  SPRINT_COMPLETED: 'sprint.completed',
  PROJECT_CREATED: 'project.created',
  PROJECT_UPDATED: 'project.updated',
  PROJECT_DELETED: 'project.deleted',
  TIME_LOGGED: 'time.logged',
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
  assigneeId?: string;
}

export interface IssueStatusChangedEvent {
  issueKey: string;
  projectKey: string;
  fromStatus: string;
  toStatus: string;
}

export interface CommentAddedEvent {
  issueKey: string;
  commentId: string;
  authorId: string;
}

export interface IssueUpdatedEvent {
  issueKey: string;
  fields: Record<string, unknown>;
}

export interface IssueAssignedEvent {
  issueKey: string;
  assigneeId: string | null;
  previousAssigneeId: string | null;
}

export interface IssueDeletedEvent {
  issueKey: string;
}

export interface ProjectCreatedEvent {
  projectKey: string;
  name: string;
  leadUserId: string;
}

export interface ProjectUpdatedEvent {
  projectKey: string;
  fields: Record<string, unknown>;
}

export interface TimeLoggedEvent {
  issueKey: string;
  minutes: number;
  description?: string;
  userId: string;
}
