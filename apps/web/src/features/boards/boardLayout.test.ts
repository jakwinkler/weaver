import { describe, expect, it } from 'vitest';
import type { BoardIssueGroup, Issue } from '@weaver/shared';
import {
  applySwimlaneValue,
  buildSwimlanes,
  getWipLimitWarning,
  isWipLimitReached,
} from './boardLayout';

function issue(id: string, overrides: Partial<Issue> = {}): Issue {
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
    sortOrder: 0,
    percentDone: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
    recurrenceRule: overrides.recurrenceRule ?? null,
    recurrenceParentId: overrides.recurrenceParentId ?? null,
    recurrenceOccurrence: overrides.recurrenceOccurrence ?? 0,
  };
}

describe('buildSwimlanes', () => {
  it('uses server labels and keeps unassigned issues in a named lane', () => {
    const issues = [issue('1', { assigneeId: 'user-1' }), issue('2', { assigneeId: undefined })];
    const serverGroups: BoardIssueGroup[] = [
      { key: 'assignee:user-1', value: 'user-1', label: 'Alex Rivera', issues: [issues[0]] },
      { key: 'assignee:none', value: null, label: 'Unassigned', issues: [issues[1]] },
    ];

    expect(buildSwimlanes(issues, 'assignee', serverGroups)).toEqual([
      { key: 'assignee:user-1', value: 'user-1', label: 'Alex Rivera', issues: [issues[0]] },
      { key: 'assignee:none', value: null, label: 'Unassigned', issues: [issues[1]] },
    ]);
  });

  it('returns a single lane when grouping is disabled', () => {
    const issues = [issue('1')];

    expect(buildSwimlanes(issues, 'none', [])).toEqual([
      { key: 'all', value: null, label: 'All issues', issues },
    ]);
  });
});

describe('swimlane drag updates', () => {
  it('updates the configured issue field when moving between lanes', () => {
    expect(applySwimlaneValue(issue('1'), 'priority', 'high').priority).toBe('high');
    expect(applySwimlaneValue(issue('1'), 'assignee', null).assigneeId).toBeUndefined();
    expect(applySwimlaneValue(issue('1'), 'epic', 'epic-1').epicId).toBe('epic-1');
  });
});

describe('WIP limits', () => {
  it('marks a column at or above its configured limit', () => {
    expect(isWipLimitReached(3, 3)).toBe(true);
    expect(isWipLimitReached(4, 3)).toBe(true);
    expect(isWipLimitReached(2, 3)).toBe(false);
    expect(isWipLimitReached(30, undefined)).toBe(false);
  });

  it('warns only when crossing into a full column', () => {
    expect(
      getWipLimitWarning({
        sourceStatusId: 'todo',
        targetStatusId: 'doing',
        targetName: 'In Progress',
        targetCount: 3,
        limit: 3,
      }),
    ).toBe('In Progress is at its WIP limit (3/3). The move will still be allowed.');
    expect(
      getWipLimitWarning({
        sourceStatusId: 'doing',
        targetStatusId: 'doing',
        targetName: 'In Progress',
        targetCount: 3,
        limit: 3,
      }),
    ).toBeNull();
  });
});
