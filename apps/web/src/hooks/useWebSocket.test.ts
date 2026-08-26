import { describe, expect, it } from 'vitest';
import { buildToastMessage, getInvalidationKeys, getToastMessageForEvent } from './websocketEvents';

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
      ['dashboard'],
    ]);
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
