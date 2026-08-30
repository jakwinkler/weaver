import { describe, expect, it } from 'vitest';
import type { Issue } from '@weaver/shared';
import {
  committedStoryPoints,
  matchesBacklogFilters,
  movePlanningIssue,
  planningContainerId,
} from './backlogPlanning';

function issue(overrides: Partial<Issue> & Pick<Issue, 'id' | 'key'>): Issue {
  return {
    projectId: 'project-1',
    summary: overrides.key,
    statusId: 'status-1',
    priority: 'medium',
    reporterId: 'user-1',
    customFields: {},
    labels: [],
    sortOrder: 0,
    percentDone: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
    recurrenceRule: overrides.recurrenceRule ?? null,
    recurrenceParentId: overrides.recurrenceParentId ?? null,
    recurrenceOccurrence: overrides.recurrenceOccurrence ?? 0,
  };
}

describe('backlog planning helpers', () => {
  const issues = [
    issue({ id: 'a', key: 'PLAN-1', sprintId: undefined, sortOrder: 1000, storyPoints: 2 }),
    issue({ id: 'b', key: 'PLAN-2', sprintId: undefined, sortOrder: 2000, storyPoints: 3 }),
    issue({ id: 'c', key: 'PLAN-3', sprintId: 'sprint-1', sortOrder: 1000, storyPoints: 5 }),
    issue({ id: 'd', key: 'PLAN-4', sprintId: 'sprint-1', sortOrder: 2000, storyPoints: null }),
  ];

  it('moves a backlog issue into a sprint before the hovered issue', () => {
    const result = movePlanningIssue(issues, 'b', 'sprint-1', 'd');

    expect(result.filter((item) => item.sprintId === 'sprint-1')).toEqual([
      expect.objectContaining({ id: 'c', sortOrder: 1000 }),
      expect.objectContaining({ id: 'b', sortOrder: 2000 }),
      expect.objectContaining({ id: 'd', sortOrder: 3000 }),
    ]);
    expect(result.find((item) => item.id === 'b')?.sprintId).toBe('sprint-1');
  });

  it('moves a sprint issue to the end of the backlog', () => {
    const result = movePlanningIssue(issues, 'c', null);

    expect(result.filter((item) => !item.sprintId)).toEqual([
      expect.objectContaining({ id: 'a', sortOrder: 1000 }),
      expect.objectContaining({ id: 'b', sortOrder: 2000 }),
      expect.objectContaining({ id: 'c', sortOrder: 3000, sprintId: null }),
    ]);
  });

  it('applies all backlog filters together', () => {
    const candidate = issue({
      id: 'filtered',
      key: 'PLAN-5',
      priority: 'high',
      assigneeId: 'user-2',
      issueTypeId: 'bug',
    });

    expect(
      matchesBacklogFilters(candidate, {
        priority: 'high',
        assigneeId: 'user-2',
        issueTypeId: 'bug',
      }),
    ).toBe(true);
    expect(matchesBacklogFilters(candidate, { priority: 'low' })).toBe(false);
    expect(matchesBacklogFilters(candidate, { assigneeId: 'unassigned' })).toBe(false);
    expect(
      matchesBacklogFilters(issue({ id: 'unassigned', key: 'PLAN-6' }), {
        assigneeId: 'unassigned',
      }),
    ).toBe(true);
  });

  it('calculates committed points and stable container identifiers', () => {
    expect(committedStoryPoints(issues.filter((item) => item.sprintId === 'sprint-1'))).toBe(5);
    expect(planningContainerId(null)).toBe('container:backlog');
    expect(planningContainerId('sprint-1')).toBe('container:sprint-1');
  });
});
