export function toggleIssueSelection(
  currentSelection: ReadonlySet<string>,
  orderedIssueIds: readonly string[],
  issueId: string,
  lastSelectedIndex: number | null,
  rangeSelection: boolean,
): Set<string> {
  const nextSelection = new Set(currentSelection);
  const currentIndex = orderedIssueIds.indexOf(issueId);
  if (currentIndex === -1) return nextSelection;

  const shouldSelect = !nextSelection.has(issueId);
  if (
    rangeSelection &&
    lastSelectedIndex !== null &&
    lastSelectedIndex >= 0 &&
    lastSelectedIndex < orderedIssueIds.length
  ) {
    const start = Math.min(lastSelectedIndex, currentIndex);
    const end = Math.max(lastSelectedIndex, currentIndex);
    for (const id of orderedIssueIds.slice(start, end + 1)) {
      if (shouldSelect) nextSelection.add(id);
      else nextSelection.delete(id);
    }
    return nextSelection;
  }

  if (shouldSelect) nextSelection.add(issueId);
  else nextSelection.delete(issueId);
  return nextSelection;
}

export function setCurrentPageSelection(
  currentSelection: ReadonlySet<string>,
  currentPageIssueIds: readonly string[],
  selected: boolean,
): Set<string> {
  const nextSelection = new Set(currentSelection);
  for (const issueId of currentPageIssueIds) {
    if (selected) nextSelection.add(issueId);
    else nextSelection.delete(issueId);
  }
  return nextSelection;
}

export function getPageSelectionState(
  currentSelection: ReadonlySet<string>,
  currentPageIssueIds: readonly string[],
): { allSelected: boolean; someSelected: boolean } {
  const selectedCount = currentPageIssueIds.filter((issueId) =>
    currentSelection.has(issueId),
  ).length;
  return {
    allSelected: currentPageIssueIds.length > 0 && selectedCount === currentPageIssueIds.length,
    someSelected: selectedCount > 0,
  };
}
