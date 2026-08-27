import { describe, expect, it } from 'vitest';
import { getNextBoardIssueId, type BoardKeyboardColumn } from './boardKeyboardNavigation';

const columns: BoardKeyboardColumn[] = [
  { statusId: 'todo', issueIds: ['one', 'two'] },
  { statusId: 'empty', issueIds: [] },
  { statusId: 'done', issueIds: ['three'] },
];

describe('getNextBoardIssueId', () => {
  it('moves vertically within a column and clamps at its edges', () => {
    expect(getNextBoardIssueId(columns, 'one', 'down')).toBe('two');
    expect(getNextBoardIssueId(columns, 'two', 'down')).toBe('two');
    expect(getNextBoardIssueId(columns, 'two', 'up')).toBe('one');
  });

  it('moves horizontally across empty columns and preserves the nearest row', () => {
    expect(getNextBoardIssueId(columns, 'two', 'right')).toBe('three');
    expect(getNextBoardIssueId(columns, 'three', 'left')).toBe('one');
  });

  it('selects the first card when navigation starts without an active card', () => {
    expect(getNextBoardIssueId(columns, null, 'down')).toBe('one');
    expect(getNextBoardIssueId([], null, 'right')).toBeNull();
  });
});
