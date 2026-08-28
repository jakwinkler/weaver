import type { BoardIssueGroup, BoardSwimlaneField, Issue, IssuePriority } from '@weaver/shared';

const PRIORITIES = new Set<IssuePriority>(['lowest', 'low', 'medium', 'high', 'highest']);

export function getSwimlaneValue(issue: Issue, field: BoardSwimlaneField): string | null {
  if (field === 'assignee') return issue.assigneeId ?? null;
  if (field === 'priority') return issue.priority;
  if (field === 'epic') return issue.epicId ?? null;
  return null;
}

export function applySwimlaneValue(
  issue: Issue,
  field: BoardSwimlaneField,
  value: string | null,
): Issue {
  if (field === 'assignee') return { ...issue, assigneeId: value ?? undefined };
  if (field === 'epic') return { ...issue, epicId: value ?? undefined };
  if (field === 'priority' && value && PRIORITIES.has(value as IssuePriority)) {
    return { ...issue, priority: value as IssuePriority };
  }
  return issue;
}

export function buildSwimlanes(
  issues: Issue[],
  field: BoardSwimlaneField,
  serverGroups: BoardIssueGroup[],
): BoardIssueGroup[] {
  if (field === 'none') {
    return [{ key: 'all', value: null, label: 'All issues', issues }];
  }

  const values = new Map<string, BoardIssueGroup>(
    serverGroups.map((group) => [group.value ?? '__none__', { ...group, issues: [] }]),
  );
  for (const issue of issues) {
    const value = getSwimlaneValue(issue, field);
    const key = value ?? '__none__';
    const group = values.get(key);
    if (group) {
      group.issues.push(issue);
      continue;
    }
    values.set(key, {
      key: `${field}:${value ?? 'none'}`,
      value,
      label: value ?? (field === 'assignee' ? 'Unassigned' : 'No epic'),
      issues: [issue],
    });
  }
  return [...values.values()];
}

export function isWipLimitReached(count: number, limit: number | undefined): boolean {
  return limit !== undefined && count >= limit;
}

export function getWipLimitWarning({
  sourceStatusId,
  targetStatusId,
  targetName,
  targetCount,
  limit,
}: {
  sourceStatusId: string;
  targetStatusId: string;
  targetName: string;
  targetCount: number;
  limit: number | undefined;
}): string | null {
  if (sourceStatusId === targetStatusId || !isWipLimitReached(targetCount, limit)) {
    return null;
  }
  return `${targetName} is at its WIP limit (${targetCount}/${limit}). The move will still be allowed.`;
}
