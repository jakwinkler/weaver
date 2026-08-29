export interface BoardKeyboardColumn {
  statusId: string;
  issueIds: string[];
}

export type BoardKeyboardDirection = 'up' | 'down' | 'left' | 'right';

export function getNextBoardIssueId(
  columns: BoardKeyboardColumn[],
  currentIssueId: string | null,
  direction: BoardKeyboardDirection,
): string | null {
  const nonEmptyColumns = columns.filter((column) => column.issueIds.length > 0);
  if (nonEmptyColumns.length === 0) return null;
  if (!currentIssueId) return nonEmptyColumns[0].issueIds[0];

  const columnIndex = columns.findIndex((column) => column.issueIds.includes(currentIssueId));
  if (columnIndex === -1) return nonEmptyColumns[0].issueIds[0];

  const currentColumn = columns[columnIndex];
  const rowIndex = currentColumn.issueIds.indexOf(currentIssueId);

  if (direction === 'up' || direction === 'down') {
    const delta = direction === 'up' ? -1 : 1;
    const nextRow = Math.max(0, Math.min(rowIndex + delta, currentColumn.issueIds.length - 1));
    return currentColumn.issueIds[nextRow];
  }

  const delta = direction === 'left' ? -1 : 1;
  for (
    let nextColumnIndex = columnIndex + delta;
    nextColumnIndex >= 0 && nextColumnIndex < columns.length;
    nextColumnIndex += delta
  ) {
    const nextColumn = columns[nextColumnIndex];
    if (nextColumn.issueIds.length > 0) {
      return nextColumn.issueIds[Math.min(rowIndex, nextColumn.issueIds.length - 1)];
    }
  }

  return currentIssueId;
}
