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

describe('time report output', () => {
  function context(rows: unknown[]) {
    return {
      db: { query: jest.fn().mockResolvedValue(rows) },
      api: { projects: { accessibleIds: jest.fn().mockResolvedValue(null) } },
    };
  }

  it('joins public.users for user grouping and labels rows without email', async () => {
    const ctx = context([]);
    await getReport({ params: {}, query: { groupBy: 'user' } }, ctx);
    const [sql] = ctx.db.query.mock.calls[0];
    expect(sql).toContain('LEFT JOIN public.users u');
    expect(sql).not.toMatch(/email/i);
  });

  it('prefixes CSV cells that a spreadsheet would read as formulas', async () => {
    const ctx = context([
      { project_key: '=HYPERLINK("http://evil")', project_name: '+1+1', total_minutes: 60, entry_count: 1 },
      { project_key: '  @SUM(A1)', project_name: '-2', total_minutes: 30, entry_count: 1 },
      { project_key: 'SAFE', project_name: 'Plain "quoted" name', total_minutes: 30, entry_count: 1 },
    ]);
    const response = await exportCsv({ params: {}, query: {} }, ctx);
    const lines = (response.body as string).split('\n');
    expect(lines[1]).toBe(`"'=HYPERLINK(""http://evil"")","'+1+1",1.00,1`);
    expect(lines[2]).toBe(`"'  @SUM(A1)","'-2",0.50,1`);
    expect(lines[3]).toBe(`"SAFE","Plain ""quoted"" name",0.50,1`);
  });
});
