import type { Issue } from '@weaver/shared';

export const SORT_ORDER_STEP = 1000;

type IssueGroupField = 'statusId' | 'sprintId';
type IssueGroupId = string | null;

interface MoveIssueOptions {
  activeId: string;
  overId: string;
  targetGroupId: IssueGroupId;
  groupField: IssueGroupField;
}

export interface MoveIssueResult {
  issues: Issue[];
  affectedIssues: Issue[];
  activeIssue: Issue | null;
  sourceGroupId: IssueGroupId;
  targetGroupId: IssueGroupId;
  changed: boolean;
}

function moveAt<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function normalizeSortOrder(issues: Issue[], startIndex = 0): Issue[] {
  return issues.map((issue, index) => ({
    ...issue,
    sortOrder: (startIndex + index) * SORT_ORDER_STEP,
  }));
}

function getGroupId(issue: Issue, field: IssueGroupField): IssueGroupId {
  return issue[field] ?? null;
}

function setGroupId(issue: Issue, field: IssueGroupField, groupId: IssueGroupId): Issue {
  if (field === 'sprintId') {
    return { ...issue, sprintId: groupId };
  }

  return groupId === null ? issue : { ...issue, statusId: groupId };
}

export function reorderIssueList(
  issues: Issue[],
  activeId: string,
  overId: string,
  startIndex = 0,
): Issue[] {
  const oldIndex = issues.findIndex((issue) => issue.id === activeId);
  const newIndex = issues.findIndex((issue) => issue.id === overId);

  if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
    return issues;
  }

  return normalizeSortOrder(moveAt(issues, oldIndex, newIndex), startIndex);
}

export function moveIssueBetweenGroups(
  issues: Issue[],
  options: MoveIssueOptions,
): MoveIssueResult {
  const { activeId, overId, targetGroupId, groupField } = options;
  const activeIssue = issues.find((issue) => issue.id === activeId);

  if (!activeIssue) {
    return {
      issues,
      affectedIssues: [],
      activeIssue: null,
      sourceGroupId: null,
      targetGroupId,
      changed: false,
    };
  }

  const sourceGroupId = getGroupId(activeIssue, groupField);
  const sourceIssues = issues
    .filter((issue) => getGroupId(issue, groupField) === sourceGroupId)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (sourceGroupId === targetGroupId) {
    const overIsIssue = sourceIssues.some((issue) => issue.id === overId);
    const reordered = overIsIssue
      ? reorderIssueList(sourceIssues, activeId, overId)
      : normalizeSortOrder(
          moveAt(
            sourceIssues,
            sourceIssues.findIndex((issue) => issue.id === activeId),
            sourceIssues.length - 1,
          ),
        );
    if (reordered === sourceIssues) {
      return {
        issues,
        affectedIssues: [],
        activeIssue,
        sourceGroupId,
        targetGroupId,
        changed: false,
      };
    }

    const replacements = new Map(reordered.map((issue) => [issue.id, issue]));
    const nextIssues = issues.map((issue) => replacements.get(issue.id) ?? issue);

    return {
      issues: nextIssues,
      affectedIssues: reordered,
      activeIssue: replacements.get(activeId) ?? activeIssue,
      sourceGroupId,
      targetGroupId,
      changed: true,
    };
  }

  const remainingSource = normalizeSortOrder(sourceIssues.filter((issue) => issue.id !== activeId));
  const targetIssues = issues
    .filter((issue) => getGroupId(issue, groupField) === targetGroupId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const targetIndex = targetIssues.findIndex((issue) => issue.id === overId);
  const movedIssue = setGroupId(activeIssue, groupField, targetGroupId);
  const nextTarget = [...targetIssues];
  nextTarget.splice(targetIndex < 0 ? nextTarget.length : targetIndex, 0, movedIssue);
  const normalizedTarget = normalizeSortOrder(nextTarget);

  const replacements = new Map(
    [...remainingSource, ...normalizedTarget].map((issue) => [issue.id, issue]),
  );
  const nextIssues = issues.map((issue) => replacements.get(issue.id) ?? issue);

  return {
    issues: nextIssues,
    affectedIssues: [...remainingSource, ...normalizedTarget],
    activeIssue: replacements.get(activeId) ?? movedIssue,
    sourceGroupId,
    targetGroupId,
    changed: true,
  };
}

export function buildReorderPayload(issues: Issue[]) {
  return issues.map(({ id, sortOrder }) => ({ id, sortOrder }));
}
