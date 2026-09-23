import { describe, expect, it } from 'vitest';
import type { Issue } from '@weaver/shared';
import { moveIssueForBoard } from './kanban-order';

function issue(id: string, statusId: string, sortOrder: number): Issue {
  return {
    id,
    projectId: 'project-id',
    key: `TEST-${id}`,
    summary: id,
    statusId,
    priority: 'medium',
    reporterId: 'user-id',
    customFields: {},
    labels: [],
    sortOrder,
    percentDone: 0,
    recurrenceRule: null,
    recurrenceParentId: null,
    recurrenceOccurrence: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('moveIssueForBoard', () => {
  it('reorders issues within the same column at the hovered position', () => {
    const moved = moveIssueForBoard(
      [issue('a', 'todo', 0), issue('b', 'todo', 1000), issue('c', 'todo', 2000)],
      'c',
      'a',
      'todo',
    );

    expect(moved.map(({ id }) => id)).toEqual(['c', 'a', 'b']);
  });

  it('moves an issue into another column at the hovered position', () => {
    const moved = moveIssueForBoard(
      [issue('a', 'todo', 0), issue('b', 'doing', 0), issue('c', 'doing', 1000)],
      'a',
      'c',
      'doing',
    );

    expect(moved.filter(({ statusId }) => statusId === 'doing').map(({ id }) => id))
      .toEqual(['b', 'a', 'c']);
    expect(moved.find(({ id }) => id === 'a')?.statusId).toBe('doing');
  });

  it('places an issue at the end when hovering over an empty column', () => {
    const moved = moveIssueForBoard(
      [issue('a', 'todo', 0), issue('b', 'doing', 0)],
      'a',
      'column-done',
      'done',
    );

    expect(moved.at(-1)).toMatchObject({ id: 'a', statusId: 'done' });
  });
});
