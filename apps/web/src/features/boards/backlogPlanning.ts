import type { Issue } from '@weaver/shared';

export interface BacklogFilters {
  priority?: string;
  assigneeId?: string;
  issueTypeId?: string;
}

export function planningContainerId(sprintId: string | null | undefined): string {
  return `container:${sprintId ?? 'backlog'}`;
}

function sameContainer(issue: Issue, sprintId: string | null): boolean {
  return (issue.sprintId ?? null) === sprintId;
}

function normalizeSortOrder(issues: Issue[]): Issue[] {
  return issues.map((issue, index) => ({ ...issue, sortOrder: (index + 1) * 1000 }));
}

export function movePlanningIssue(
  issues: Issue[],
  activeIssueId: string,
  targetSprintId: string | null,
  overIssueId?: string,
): Issue[] {
  const activeIssue = issues.find((issue) => issue.id === activeIssueId);
  if (!activeIssue) return issues;

  const sourceSprintId = activeIssue.sprintId ?? null;
  const targetIssues = issues
    .filter((issue) => issue.id !== activeIssueId && sameContainer(issue, targetSprintId))
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const targetIndex = overIssueId
    ? targetIssues.findIndex((issue) => issue.id === overIssueId)
    : -1;
  const movedIssue = { ...activeIssue, sprintId: targetSprintId };
  targetIssues.splice(targetIndex >= 0 ? targetIndex : targetIssues.length, 0, movedIssue);

  const target = normalizeSortOrder(targetIssues);
  if (sourceSprintId === targetSprintId) {
    const unaffected = issues.filter((issue) => !sameContainer(issue, targetSprintId));
    return [...unaffected, ...target];
  }

  const source = normalizeSortOrder(
    issues
      .filter((issue) => issue.id !== activeIssueId && sameContainer(issue, sourceSprintId))
      .sort((left, right) => left.sortOrder - right.sortOrder),
  );
  const unaffected = issues.filter(
    (issue) => !sameContainer(issue, sourceSprintId) && !sameContainer(issue, targetSprintId),
  );

  return [...unaffected, ...source, ...target];
}

export function matchesBacklogFilters(issue: Issue, filters: BacklogFilters): boolean {
  if (filters.priority && issue.priority !== filters.priority) return false;
  if (filters.assigneeId === 'unassigned' && issue.assigneeId) return false;
  if (
    filters.assigneeId &&
    filters.assigneeId !== 'unassigned' &&
    issue.assigneeId !== filters.assigneeId
  ) {
    return false;
  }
  if (filters.issueTypeId && issue.issueTypeId !== filters.issueTypeId) return false;
  return true;
}

export function committedStoryPoints(issues: Issue[]): number {
  return issues.reduce((total, issue) => total + (issue.storyPoints ?? 0), 0);
}
