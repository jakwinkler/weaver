import { SearchService } from './search.service';

describe('typed WQL values', () => {
  const service = new SearchService({} as any, {} as any) as any;
  it.each([
    ['assignee', '=', 'not-a-uuid'],
    ['reporter', '=', 'x'],
    ['project', '=', 'x'],
    ['created', '>', 'yesterday'],
    ['updated', '<', '2026-02-30'],
    ['assignee', '~', '0a1c9c34-a96c-4363-a962-77eb53ea1d72'],
    ['created', '~', '2026-09-01'],
    ['label', '>', 'bug'],
    ['priority', '=', 'garbage'],
  ])('rejects %s %s %s before querying Postgres', async (field, operator, value) => {
    await expect(
      service.buildCondition({ field, operator, value }, 'p0', {}, new Map()),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('preserves supported date comparisons and UUID equality', async () => {
    await expect(
      service.buildCondition(
        { field: 'created', operator: '>=', value: '2026-09-01' },
        'p0',
        {},
        new Map(),
      ),
    ).resolves.toContain('>=');
    await expect(
      service.buildCondition(
        { field: 'assignee', operator: '=', value: '0a1c9c34-a96c-4363-a962-77eb53ea1d72' },
        'p0',
        {},
        new Map(),
      ),
    ).resolves.toContain('assignee_id =');
  });
});
