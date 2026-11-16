import { applyIssueListOrder } from './issue-list-order';

describe('numeric issue list ordering', () => {
  it('uses descending numeric keys for imports before pagination without changing rank', () => {
    const qb = {
      addSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
    };
    const params = { page: 2, perPage: 25 };
    expect(
      applyIssueListOrder(qb as never, params, { 'jira.source-id': '42' }).sort,
    ).toBeUndefined();
    expect(qb.addSelect).toHaveBeenCalledWith(
      expect.stringContaining('numeric'),
      'issue_key_number',
    );
    expect(qb.orderBy).toHaveBeenCalledWith('issue_key_number', 'DESC', 'NULLS LAST');
  });
  it('respects manual rank and explicit non-key sorts', () => {
    for (const sort of ['sortOrder', '-createdAt']) {
      const qb = { addSelect: jest.fn(), orderBy: jest.fn(), addOrderBy: jest.fn() };
      expect(
        applyIssueListOrder(qb as never, { page: 1, perPage: 25, sort }, { 'jira.source-id': '42' })
          .sort,
      ).toBe(sort);
      expect(qb.addSelect).not.toHaveBeenCalled();
    }
  });
});
