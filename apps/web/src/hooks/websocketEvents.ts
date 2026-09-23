export interface WsEventPayload {
  event: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export const DOMAIN_EVENTS = [
  'issue.created',
  'issue.updated',
  'issue.bulk_updated',
  'issue.assigned',
  'issue.moved',
  'issue.reordered',
  'issue.status_changed',
  'issue.deleted',
  'issue.bulk_deleted',
  'comment.created',
  'comment.updated',
  'comment.deleted',
  'project.created',
  'project.updated',
  'checklist.item_added',
  'checklist.item_completed',
  'checklist.item_removed',
  'relation.created',
  'relation.removed',
] as const;

/** Map domain events to React Query keys that should be invalidated. */
export function getInvalidationKeys(event: string, data: Record<string, unknown>): string[][] {
  const issueKey = typeof data.issueKey === 'string' ? data.issueKey : undefined;
  const projectKey = typeof data.projectKey === 'string' ? data.projectKey : undefined;

  switch (event) {
    case 'issue.created':
      return [['issues'], ...(projectKey ? [['issues', projectKey]] : []), ['dashboard']];
    case 'issue.updated':
    case 'issue.assigned':
    case 'issue.moved':
    case 'issue.status_changed':
      return [...(issueKey ? [['issue', issueKey]] : []), ['issues'], ['boards'], ['dashboard']];
    case 'issue.bulk_updated':
      return [['issues'], ['boards'], ['dashboard']];
    case 'issue.reordered':
      return [
        ['issues'],
        ...(projectKey ? [['issues', projectKey]] : []),
        ['boards'],
        ['dashboard'],
      ];
    case 'issue.deleted':
    case 'issue.bulk_deleted':
      return [['issues'], ['boards'], ['dashboard']];
    case 'comment.created':
    case 'comment.updated':
    case 'comment.deleted':
      return [
        ...(issueKey ? [['comments', issueKey]] : []),
        ...(issueKey ? [['activity', issueKey]] : []),
      ];
    case 'project.created':
    case 'project.updated':
      return [['projects'], ...(projectKey ? [['project', projectKey]] : []), ['dashboard']];
    case 'checklist.item_added':
    case 'checklist.item_completed':
    case 'checklist.item_removed':
      return [
        ...(issueKey ? [['activity', issueKey]] : []),
        ...(issueKey ? [['checklist', issueKey]] : []),
      ];
    case 'relation.created':
    case 'relation.removed': {
      const targetKey = typeof data.targetIssueKey === 'string' ? data.targetIssueKey : undefined;
      return [
        ...(issueKey ? [['relations', issueKey]] : []),
        ...(targetKey ? [['relations', targetKey]] : []),
        ...(issueKey ? [['activity', issueKey]] : []),
      ];
    }
    default:
      return [];
  }
}

/** Build a human-readable toast message for events from other users. */
export function buildToastMessage(event: string, data: Record<string, unknown>): string | null {
  const issueKey = typeof data.issueKey === 'string' ? data.issueKey : undefined;
  const projectKey = typeof data.projectKey === 'string' ? data.projectKey : undefined;

  switch (event) {
    case 'issue.created':
      return `${issueKey ?? 'An issue'} was created: ${data.summary ?? ''}`;
    case 'issue.updated':
      return `${issueKey ?? 'An issue'} was updated`;
    case 'issue.bulk_updated':
      return `${data.count ?? 'Multiple'} issues were updated`;
    case 'issue.assigned':
      return `${issueKey ?? 'An issue'} was reassigned`;
    case 'issue.moved':
    case 'issue.status_changed':
      return `${issueKey ?? 'An issue'} changed status`;
    case 'issue.reordered':
      return `Issue order changed in ${projectKey ?? 'a project'}`;
    case 'issue.deleted':
      return `${issueKey ?? 'An issue'} was deleted`;
    case 'issue.bulk_deleted':
      return `${data.count ?? 'Multiple'} issues were deleted`;
    case 'comment.created':
      return `New comment on ${issueKey ?? 'an issue'}`;
    case 'comment.updated':
      return `Comment updated on ${issueKey ?? 'an issue'}`;
    case 'project.created':
      return `New project created: ${data.name ?? projectKey ?? ''}`;
    default:
      return null;
  }
}

export function getToastMessageForEvent(
  event: string,
  data: Record<string, unknown>,
  currentUserId: string | undefined,
): string | null {
  const eventUserId = typeof data.userId === 'string' ? data.userId : undefined;
  if (!eventUserId || !currentUserId || eventUserId === currentUserId) {
    return null;
  }

  return buildToastMessage(event, data);
}
