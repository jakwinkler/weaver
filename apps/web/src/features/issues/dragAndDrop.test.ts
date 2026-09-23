import { describe, expect, it } from 'vitest';
import type { Issue } from '@weaver/shared';
import { buildReorderPayload, moveIssueBetweenGroups, reorderIssueList } from './dragAndDrop';

function issue(id: string, sortOrder: number, overrides: Partial<Issue> = {}): Issue {
  return {
    id,
    projectId: 'project-1',
    key: `WEB-${id}`,
    summary: `Issue ${id}`,
    statusId: 'todo',
    priority: 'medium',
    reporterId: 'user-1',
    customFields: {},
    labels: [],
    sortOrder,
    percentDone: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
    recurrenceRule: overrides.recurrenceRule ?? null,
    recurrenceParentId: overrides.recurrenceParentId ?? null,
    recurrenceOccurrence: overrides.recurrenceOccurrence ?? 0,
  };
}

describe('reorderIssueList', () => {
  it('moves a row and normalizes the persisted sort order', () => {
    const result = reorderIssueList([issue('a', 0), issue('b', 1000), issue('c', 2000)], 'a', 'c');

    expect(result.map((item) => item.id)).toEqual(['b', 'c', 'a']);
    expect(result.map((item) => item.sortOrder)).toEqual([0, 1000, 2000]);
  });

  it('preserves the absolute offset when reordering a paginated list', () => {
    const result = reorderIssueList([issue('a', 50_000), issue('b', 51_000)], 'b', 'a', 50);

    expect(result.map((item) => item.id)).toEqual(['b', 'a']);
    expect(result.map((item) => item.sortOrder)).toEqual([50_000, 51_000]);
  });
});

describe('moveIssueBetweenGroups', () => {
  it('moves an issue from the backlog into a sprint at the hovered position', () => {
    const result = moveIssueBetweenGroups(
      [
        issue('a', 0, { sprintId: null }),
        issue('b', 0, { sprintId: 'sprint-1' }),
        issue('c', 1000, { sprintId: 'sprint-1' }),
      ],
      {
        activeId: 'a',
        overId: 'c',
        targetGroupId: 'sprint-1',
        groupField: 'sprintId',
      },
    );

    expect(result.changed).toBe(true);
    expect(result.activeIssue?.sprintId).toBe('sprint-1');
    expect(
      result.issues
        .filter((item) => item.sprintId === 'sprint-1')
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((item) => item.id),
    ).toEqual(['b', 'a', 'c']);
    expect(buildReorderPayload(result.affectedIssues)).toEqual([
      { id: 'b', sortOrder: 0 },
      { id: 'a', sortOrder: 1000 },
      { id: 'c', sortOrder: 2000 },
    ]);
  });

  it('moves an issue from a sprint to the end of the backlog', () => {
    const result = moveIssueBetweenGroups(
      [issue('a', 0, { sprintId: null }), issue('b', 0, { sprintId: 'sprint-1' })],
      {
        activeId: 'b',
        overId: 'backlog',
        targetGroupId: null,
        groupField: 'sprintId',
      },
    );

    expect(result.activeIssue?.sprintId).toBeNull();
    expect(
      result.issues
        .filter((item) => item.sprintId == null)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((item) => item.id),
    ).toEqual(['a', 'b']);
  });

  it('reorders issues inside an existing Kanban column', () => {
    const result = moveIssueBetweenGroups(
      [
        issue('a', 0, { statusId: 'todo' }),
        issue('b', 1000, { statusId: 'todo' }),
        issue('c', 0, { statusId: 'done' }),
      ],
      {
        activeId: 'a',
        overId: 'b',
        targetGroupId: 'todo',
        groupField: 'statusId',
      },
    );

    expect(result.changed).toBe(true);
    expect(
      result.issues
        .filter((item) => item.statusId === 'todo')
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((item) => item.id),
    ).toEqual(['b', 'a']);
  });

  it('moves an issue to the end when it is dropped on its container', () => {
    const result = moveIssueBetweenGroups([issue('a', 0), issue('b', 1000), issue('c', 2000)], {
      activeId: 'a',
      overId: 'column-todo',
      targetGroupId: 'todo',
      groupField: 'statusId',
    });

    expect(result.issues.sort((a, b) => a.sortOrder - b.sortOrder).map((item) => item.id)).toEqual([
      'b',
      'c',
      'a',
    ]);
  });
});
