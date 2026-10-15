import { describe, expect, it } from 'vitest';
import {
  buildToastMessage,
  DOMAIN_EVENTS,
  getInvalidationKeys,
  getToastMessageForEvent,
} from './websocketEvents';

describe('getInvalidationKeys', () => {
  it('refreshes comments and activity after a comment edit', () => {
    expect(getInvalidationKeys('comment.updated', { issueKey: 'WS-1' })).toEqual([
      ['comments', 'WS-1'],
      ['activity', 'WS-1'],
    ]);
  });

  it('refreshes project issue and board data after a reorder', () => {
    expect(getInvalidationKeys('issue.reordered', { projectKey: 'WS' })).toEqual([
      ['issues'],
      ['issues', 'WS'],
      ['boards'],
      ['boardIssues'],
      ['backlog'],
      ['sprintStats'],
      ['dashboard'],
    ]);
  });

  it.each([
    'issue.created',
    'issue.updated',
    'issue.bulk_updated',
    'issue.assigned',
    'issue.moved',
    'issue.reordered',
    'issue.status_changed',
    'issue.deleted',
    'issue.bulk_deleted',
  ])('refreshes board cards, the backlog, and sprint totals after %s', (event) => {
    expect(getInvalidationKeys(event, { issueKey: 'WS-1', projectKey: 'WS' })).toEqual(
      expect.arrayContaining([['issues'], ['boardIssues'], ['backlog'], ['sprintStats']]),
    );
  });

  it('refreshes the open issue and its activity after another session edits it', () => {
    expect(getInvalidationKeys('issue.updated', { issueKey: 'WS-1' })).toEqual(
      expect.arrayContaining([['issue', 'WS-1'], ['activity', 'WS-1']]),
    );
  });

  it.each([
    'sprint.created',
    'sprint.updated',
    'sprint.started',
    'sprint.completed',
    'sprint.deleted',
    'time.logged',
    'time.updated',
    'time.deleted',
  ])('listens for %s', (event) => {
    expect(DOMAIN_EVENTS).toContain(event);
  });

  it.each(['sprint.created', 'sprint.updated', 'sprint.started'])(
    'refreshes sprint lists and reports by prefix after %s',
    (event) => {
      // Sprint lists are keyed by project ID, so a project-scoped key would miss them.
      expect(
        getInvalidationKeys(event, { sprintId: 'sprint-1', projectId: 'project-1', projectKey: 'WS' }),
      ).toEqual([['sprints'], ['sprint-report']]);
    },
  );

  it.each(['sprint.completed', 'sprint.deleted'])(
    'refreshes sprint lists and the issues returned to the backlog after %s',
    (event) => {
      expect(getInvalidationKeys(event, { sprintId: 'sprint-1', projectKey: 'WS' })).toEqual([
        ['sprints'],
        ['sprint-report'],
        ['issues'],
        ['boardIssues'],
        ['backlog'],
        ['sprintStats'],
      ]);
    },
  );

  it.each(['time.logged', 'time.updated', 'time.deleted'])(
    'refreshes the issue time entries and total after %s',
    (event) => {
      expect(getInvalidationKeys(event, { issueKey: 'WS-1', projectKey: 'WS' })).toEqual([
        ['timeEntries', 'WS-1'],
        ['timeEntrySummary', 'WS-1'],
      ]);
    },
  );

  it('ignores time events that do not name an issue', () => {
    expect(getInvalidationKeys('time.updated', { entryId: 'entry-1' })).toEqual([]);
  });
});

describe('buildToastMessage', () => {
  it('describes comment edits and issue reorders', () => {
    expect(buildToastMessage('comment.updated', { issueKey: 'WS-1' })).toBe(
      'Comment updated on WS-1',
    );
    expect(buildToastMessage('issue.reordered', { projectKey: 'WS' })).toBe(
      'Issue order changed in WS',
    );
  });

  it('names the sprint another user started or completed', () => {
    expect(buildToastMessage('sprint.started', { name: 'Sprint 4' })).toBe('Sprint 4 started');
    expect(buildToastMessage('sprint.completed', { name: 'Sprint 4' })).toBe(
      'Sprint 4 was completed',
    );
    expect(buildToastMessage('sprint.started', {})).toBe('A sprint started');
  });

  it.each(['sprint.created', 'sprint.updated', 'sprint.deleted', 'time.logged', 'time.updated', 'time.deleted'])(
    'stays quiet for %s',
    (event) => {
      expect(buildToastMessage(event, { name: 'Sprint 4', issueKey: 'WS-1' })).toBeNull();
    },
  );
});

describe('getToastMessageForEvent', () => {
  it('shows messages only for events from another known user', () => {
    expect(
      getToastMessageForEvent(
        'comment.created',
        { issueKey: 'WS-1', userId: 'other-user' },
        'current-user',
      ),
    ).toBe('New comment on WS-1');
    expect(
      getToastMessageForEvent(
        'comment.created',
        { issueKey: 'WS-1', userId: 'current-user' },
        'current-user',
      ),
    ).toBeNull();
    expect(
      getToastMessageForEvent('comment.created', { issueKey: 'WS-1' }, 'current-user'),
    ).toBeNull();
  });
});
