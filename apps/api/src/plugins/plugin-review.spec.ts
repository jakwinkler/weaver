/* eslint-disable @typescript-eslint/no-require-imports -- Load sibling plugin sources without including them in the API TypeScript rootDir. */
const {
  createRelation,
  deleteRelation,
  listRelations,
  searchIssues,
} = require('../../../../plugins/plugin-relations/src/server/handlers');
const {
  getReport,
  exportCsv,
} = require('../../../../plugins/plugin-time-reports/src/server/handlers');
const { listAllItems } = require('../../../../plugins/plugin-checklist/src/server/handlers');

describe('plugin project access', () => {
  function context() {
    return {
      settings: { trackActivity: false },
      db: { query: jest.fn().mockResolvedValue([]) },
      api: {
        issues: { assertAccess: jest.fn().mockRejectedValue(new Error('denied')) },
        projects: { accessibleIds: jest.fn().mockResolvedValue(['allowed-project']) },
      },
      events: { emit: jest.fn() },
    } as any;
  }
  it('rejects a relation to a private target before inserting', async () => {
    const ctx = context();
    ctx.db.query.mockResolvedValueOnce([{ id: 'own' }]).mockResolvedValueOnce([{ id: 'private' }]);
    await expect(
      createRelation(
        {
          params: { issueKey: 'OWN-1' },
          body: { targetIssueKey: 'PRIVATE-1', linkType: 'blocks' },
        } as any,
        ctx,
      ),
    ).rejects.toThrow('denied');
    expect(ctx.db.query.mock.calls.some(([sql]: [string]) => sql.includes('INSERT'))).toBe(false);
  });
  it('requires write access to the far end when deleting', async () => {
    const ctx = context();
    ctx.db.query
      .mockResolvedValueOnce([{ id: 'own' }])
      .mockResolvedValueOnce([
        {
          id: 'link',
          sourceIssueId: 'own',
          targetKey: 'PRIVATE-1',
          sourceKey: 'OWN-1',
          linkType: 'blocks',
        },
      ]);
    await expect(
      deleteRelation({ params: { issueKey: 'OWN-1', linkId: 'link' } } as any, ctx),
    ).rejects.toThrow('denied');
    expect(ctx.db.query.mock.calls.some(([sql]: [string]) => sql.includes('DELETE'))).toBe(false);
  });
  it.each([getReport, exportCsv, listAllItems, searchIssues, listRelations])(
    'scopes %p queries to visible projects',
    async (handler) => {
      const ctx = context();
      if (handler === searchIssues || handler === listRelations)
        ctx.db.query.mockResolvedValueOnce([{ id: 'own' }]);
      await handler({ params: { issueKey: 'OWN-1' }, query: { q: 'test' } } as any, ctx);
      const calls = ctx.db.query.mock.calls;
      expect(
        calls.some(
          ([sql, params]: [string, unknown[]]) =>
            sql.includes('ANY(') &&
            params.some((p) => Array.isArray(p) && p.includes('allowed-project')),
        ),
      ).toBe(true);
    },
  );
});
