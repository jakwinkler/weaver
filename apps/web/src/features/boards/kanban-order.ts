import type { BoardConfig, Issue } from '@weaver/shared';
import { moveIssueBetweenGroups, type MoveIssueResult } from '@/features/issues/dragAndDrop';

/** A Jira column may contain several statuses. Reordering it preserves each status. */
export function moveIssueInBoardColumns(
  issues: Issue[],
  activeId: string,
  overId: string,
  targetStatusId: string,
  columns: BoardConfig['columns'],
): MoveIssueResult {
  const originalStatuses = new Map(issues.map((issue) => [issue.id, issue.statusId]));
  const columnFor = (statusId: string) =>
    columns?.find((column) => column.statusIds.includes(statusId))?.statusIds[0] ?? statusId;
  const originalStatus = originalStatuses.get(activeId);
  const sameColumn = originalStatus && columnFor(originalStatus) === columnFor(targetStatusId);
  const result = moveIssueBetweenGroups(
    issues.map((issue) => ({ ...issue, statusId: columnFor(issue.statusId) })),
    { activeId, overId, targetGroupId: columnFor(targetStatusId), groupField: 'statusId' },
  );
  const restore = (issue: Issue) => ({
    ...issue,
    statusId:
      issue.id === activeId && !sameColumn ? targetStatusId : originalStatuses.get(issue.id)!,
  });
  return {
    ...result,
    issues: result.issues.map(restore),
    affectedIssues: result.affectedIssues.map(restore),
    activeIssue: result.activeIssue ? restore(result.activeIssue) : null,
  };
}

export function moveIssueForBoard(
  issues: Issue[],
  activeId: string,
  overId: string,
  targetStatusId: string,
): Issue[] {
  const activeIssue = issues.find((issue) => issue.id === activeId);
  if (!activeIssue || activeId === overId) {
    return issues;
  }

  const remaining = issues.filter((issue) => issue.id !== activeId);
  const movedIssue = { ...activeIssue, statusId: targetStatusId };
  let insertionIndex = remaining.findIndex((issue) => issue.id === overId);

  if (insertionIndex < 0) {
    let lastTargetIndex = -1;
    for (let index = remaining.length - 1; index >= 0; index -= 1) {
      if (remaining[index].statusId === targetStatusId) {
        lastTargetIndex = index;
        break;
      }
    }
    insertionIndex = lastTargetIndex < 0 ? remaining.length : lastTargetIndex + 1;
  }

  const moved = [...remaining];
  moved.splice(insertionIndex, 0, movedIssue);
  return moved;
}
