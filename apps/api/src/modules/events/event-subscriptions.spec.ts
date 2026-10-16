import { subscribesTo } from './event-subscriptions';

describe('subscribesTo', () => {
  it('matches the exact event name and the wildcard', () => {
    expect(subscribesTo(['issue.created'], 'issue.created')).toBe(true);
    expect(subscribesTo(['*'], 'sprint.started')).toBe(true);
    expect(subscribesTo(['issue.created'], 'issue.updated')).toBe(false);
    expect(subscribesTo([], 'issue.created')).toBe(false);
  });

  it('delivers comment.created to subscriptions that still name comment.added', () => {
    expect(subscribesTo(['comment.added'], 'comment.created')).toBe(true);
  });

  it('does not treat comment.added as an alias for other comment events', () => {
    expect(subscribesTo(['comment.added'], 'comment.updated')).toBe(false);
    expect(subscribesTo(['comment.added'], 'comment.deleted')).toBe(false);
    expect(subscribesTo(['comment.created'], 'comment.added')).toBe(false);
  });

  it('ignores names that only exist on the object prototype', () => {
    expect(subscribesTo(['constructor', '__proto__'], 'comment.created')).toBe(false);
  });
});
