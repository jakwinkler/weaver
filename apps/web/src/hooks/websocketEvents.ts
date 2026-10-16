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
  'sprint.created',
  'sprint.updated',
  'sprint.started',
  'sprint.completed',
  'sprint.deleted',
  'time.logged',
  'time.updated',
  'time.deleted',
] as const;

/** Board cards, the backlog, and sprint totals cache issues under keys of their own. */
const ISSUE_PLANNING_KEYS = [['boardIssues'], ['backlog'], ['sprintStats']];

/**
 * Sprint lists are keyed by project ID and sprint reports by sprint ID or
 * project key, so sprint events invalidate both by prefix.
 */
const SPRINT_KEYS = [['sprints'], ['sprint-report']];

/** Map domain events to React Query keys that should be invalidated. */
export function getInvalidationKeys(event: string, data: Record<string, unknown>): string[][] {
  const issueKey = typeof data.issueKey === 'string' ? data.issueKey : undefined;
  const projectKey = typeof data.projectKey === 'string' ? data.projectKey : undefined;

  switch (event) {
    case 'issue.created':
      return [
        ['issues'],
        ...(projectKey ? [['issues', projectKey]] : []),
        ...ISSUE_PLANNING_KEYS,
        ['dashboard'],
      ];
    case 'issue.updated':
    case 'issue.assigned':
    case 'issue.moved':
    case 'issue.status_changed':
      return [
        ...(issueKey ? [['issue', issueKey], ['activity', issueKey]] : []),
        ['issues'],
        ['boards'],
        ...ISSUE_PLANNING_KEYS,
        ['dashboard'],
      ];
    case 'issue.bulk_updated':
      return [['issues'], ['boards'], ...ISSUE_PLANNING_KEYS, ['dashboard']];
    case 'issue.reordered':
      return [
        ['issues'],
        ...(projectKey ? [['issues', projectKey]] : []),
        ['boards'],
        ...ISSUE_PLANNING_KEYS,
        ['dashboard'],
      ];
    case 'issue.deleted':
    case 'issue.bulk_deleted':
      return [['issues'], ['boards'], ...ISSUE_PLANNING_KEYS, ['dashboard']];
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
    case 'sprint.created':
    case 'sprint.updated':
    case 'sprint.started':
      return [...SPRINT_KEYS];
    // Completing or deleting a sprint moves issues back to the backlog without issue events.
    case 'sprint.completed':
    case 'sprint.deleted':
      return [...SPRINT_KEYS, ['issues'], ...ISSUE_PLANNING_KEYS];
    case 'time.logged':
    case 'time.updated':
    case 'time.deleted':
      return issueKey ? [['timeEntries', issueKey], ['timeEntrySummary', issueKey]] : [];
    default:
      return [];
  }
}

/** Window for coalescing invalidations from a burst of live events. */
export const INVALIDATION_BATCH_MS = 250;

export interface InvalidationBatch {
  add(keys: string[][]): void;
  flush(): void;
}

function coversKey(prefix: string[], key: string[]): boolean {
  return prefix.length <= key.length && prefix.every((part, index) => part === key[index]);
}

/**
 * Collect query keys from events that arrive within `delayMs` of the first one and
 * invalidate each key once. Every viewer receives every event, and broad keys such as
 * ['issues'] refetch whole issue lists, so one refresh per burst replaces one per event.
 * A key covered by a broader key in the same batch is skipped because prefix
 * invalidation already refreshes it.
 */
export function createInvalidationBatch(
  invalidate: (queryKey: string[]) => void,
  delayMs = INVALIDATION_BATCH_MS,
): InvalidationBatch {
  let pending: string[][] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const keys = pending;
    pending = [];
    for (const key of keys) {
      const covered = keys.some((other) => other.length < key.length && coversKey(other, key));
      if (!covered) invalidate(key);
    }
  };

  return {
    add(keys) {
      for (const key of keys) {
        const queued = pending.some(
          (existing) => existing.length === key.length && coversKey(existing, key),
        );
        if (!queued) pending.push(key);
      }
      if (pending.length > 0 && !timer) timer = setTimeout(flush, delayMs);
    },
    flush,
  };
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
    case 'sprint.started':
      return `${data.name ?? 'A sprint'} started`;
    case 'sprint.completed':
      return `${data.name ?? 'A sprint'} was completed`;
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
