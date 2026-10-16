import { IssueEntity } from '@weaver/db';
import { IssuesService } from './issues.service';
import { tenantStorage } from '../../core/tenant/tenant.context';

describe('issue hierarchy updates', () => {
  function fixture() {
    const calls: string[] = [];
    const issues: Record<string, { id: string; key: string; projectId: string; parentId: string | null; epicId: string | null }> = {
      i1: { id: 'i1', key: 'PRJ-1', projectId: 'p1', parentId: null, epicId: null },
      i2: { id: 'i2', key: 'PRJ-2', projectId: 'p1', parentId: null, epicId: null },
    };
    const repo = {
      findOne: jest.fn(async (options: { lock?: unknown }) => {
        calls.push(options.lock ? 'row lock' : 'project lookup');
        return { ...issues.i1, statusId: 'todo', sprintId: null, labels: [] };
      }),
      findOneBy: jest.fn(async ({ id }: { id: string }) => issues[id] ?? null),
      save: jest.fn(async (value) => value),
    };
    const query = jest.fn(async () => {
      calls.push('hierarchy lock');
      return [];
    });
    const manager = { getRepository: (entity: unknown) => (entity === IssueEntity ? repo : {}), query };
    const connections = { getEntityManager: async () => manager, runInTenantTransaction: async (fn: any) => fn(manager) };
    const events = { emit: jest.fn() };
    const service = new IssuesService({} as never, connections as never, {} as never, {} as never, events as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    jest.spyOn(service as any, 'logTrackedUpdateActivity').mockResolvedValue(undefined);
    return { service, query, calls };
  }
  const inTenant = (fn: () => Promise<unknown>) => tenantStorage.run({ tenantId: 't1', schemaName: 'tenant_test' }, fn);

  it.each([
    ['parent', { parentId: 'i2' }],
    ['epic', { epicId: 'i2' }],
    ['cleared epic', { epicId: null }],
  ])('locks the project hierarchy before the issue row for a %s change', async (_label, dto) => {
    const { service, query, calls } = fixture();

    await inTenant(() => service.update('PRJ-1', dto, 'u1'));

    expect(query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock(hashtext($1))', ['issue-hierarchy:tenant_test:p1']);
    expect(calls).toEqual(['project lookup', 'hierarchy lock', 'row lock']);
  });

  it('skips the hierarchy lock for updates that leave parent and epic alone', async () => {
    const { service, query, calls } = fixture();

    await inTenant(() => service.update('PRJ-1', { summary: 'Renamed' }, 'u1'));

    expect(query).not.toHaveBeenCalled();
    expect(calls).toEqual(['row lock']);
  });
});
