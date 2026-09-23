import { describe, expect, it } from 'vitest';
import {
  getPageSelectionState,
  setCurrentPageSelection,
  toggleIssueSelection,
} from './issueSelection';

const issueIds = ['issue-1', 'issue-2', 'issue-3', 'issue-4', 'issue-5'];

describe('issue selection', () => {
  it('selects the range between the anchor and shift-clicked issue', () => {
    const selected = toggleIssueSelection(new Set(['issue-2']), issueIds, 'issue-5', 1, true);

    expect([...selected]).toEqual(['issue-2', 'issue-3', 'issue-4', 'issue-5']);
  });

  it('deselects a range when the shift-clicked issue was selected', () => {
    const selected = toggleIssueSelection(new Set(issueIds), issueIds, 'issue-4', 1, true);

    expect([...selected]).toEqual(['issue-1', 'issue-5']);
  });

  it('selects only IDs from the current page', () => {
    const selected = setCurrentPageSelection(
      new Set(['other-page-issue']),
      issueIds.slice(0, 3),
      true,
    );

    expect([...selected]).toEqual(['other-page-issue', 'issue-1', 'issue-2', 'issue-3']);
    expect(selected.has('issue-4')).toBe(false);
  });

  it('reports checked and indeterminate page states', () => {
    expect(getPageSelectionState(new Set(['issue-1']), issueIds)).toEqual({
      allSelected: false,
      someSelected: true,
    });
    expect(getPageSelectionState(new Set(issueIds), issueIds)).toEqual({
      allSelected: true,
      someSelected: true,
    });
  });
});
