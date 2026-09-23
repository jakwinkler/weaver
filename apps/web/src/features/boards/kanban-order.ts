import type { Issue } from '@weaver/shared';

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
