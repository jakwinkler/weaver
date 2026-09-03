import { IssuesService } from './issues.service';
import { IssueEntity, SprintEntity } from '@weaver/db';
import { tenantStorage } from '../../core/tenant/tenant.context';

describe('combined issue mutation invariants', () => {
  function fixture() {
    const issue = { id: 'i1', key: 'PRJ-1', projectId: 'p1', statusId: 'todo', sprintId: null, labels: [] };
    const repo = { find: jest.fn().mockResolvedValue([issue]), findOne: jest.fn().mockResolvedValue(issue), save: jest.fn(async (value) => value) };
    const sprintRepo = { findOne: jest.fn().mockResolvedValue({ id: 's2', projectId: 'p2', status: 'planned' }) };
    const manager = { getRepository: (entity: unknown) => entity === IssueEntity ? repo : entity === SprintEntity ? sprintRepo : {}, transaction: async (fn: any) => fn(manager) };
    const connections = { getEntityManager: async () => manager, runInTenantTransaction: async (fn: any) => fn(manager) };
    const events = { emit: jest.fn() };
    const service = new IssuesService({} as never, connections as never, {} as never, {} as never, events as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    jest.spyOn(service as any, 'buildBulkActivityEntries').mockResolvedValue([]);
    jest.spyOn(service as any, 'logTrackedUpdateActivity').mockResolvedValue(undefined);
    return { service, repo, sprintRepo, events };
  }
  const inTenant = (fn: () => Promise<unknown>) => tenantStorage.run({ tenantId: 't1', schemaName: 'tenant_test' }, fn);
  it('scopes bulk events to each project without leaking other issue IDs', async () => {
    const { service, repo, events } = fixture();
    repo.find.mockResolvedValue([
      { id: 'i1', key: 'ONE-1', projectId: 'p1', labels: [] },
      { id: 'i2', key: 'TWO-1', projectId: 'p2', labels: [] },
    ]);
    await inTenant(() => service.bulkUpdate(['i1', 'i2'], { priority: 'high' }, 'u1'));
    expect(events.emit).toHaveBeenCalledTimes(2);
    expect(events.emit).toHaveBeenCalledWith('issue.bulk_updated', expect.objectContaining({ projectKey: 'ONE', issueIds: ['i1'], count: 1 }));
    expect(events.emit).toHaveBeenCalledWith('issue.bulk_updated', expect.objectContaining({ projectKey: 'TWO', issueIds: ['i2'], count: 1 }));
  });
  it('applies workflow conditions to bulk status changes', async () => {
    const { service } = fixture();
    const transition = jest.spyOn(service as any, 'performTransitionInManager').mockRejectedValue(new Error('Condition denied'));
    await expect(inTenant(() => service.bulkUpdate(['i1'], { statusId: 'done' }, 'u1'))).rejects.toThrow('Condition denied');
    expect(transition).toHaveBeenCalled();
  });
  it.each(['update', 'bulkUpdate'] as const)('%s rejects cross-project sprint assignment', async (method) => {
    const { service, repo } = fixture();
    await expect(inTenant(() => method === 'update' ? service.update('PRJ-1', { sprintId: 's2' }, 'u1') : service.bulkUpdate(['i1'], { sprintId: 's2' }, 'u1'))).rejects.toThrow('same project');
    expect(repo.save).not.toHaveBeenCalled();
  });
});
