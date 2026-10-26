import { BadRequestException } from '@nestjs/common';
import { ActivityLogEntity, IssueEntity } from '@weaver/db';
import { IssuesController } from './issues.controller';
import { IssuesService } from './issues.service';
import { tenantStorage } from '../../core/tenant/tenant.context';

describe('issue subtasks', () => {
  function fixture() {
    const issues: Record<string, Partial<IssueEntity>> = {
      parent: { id: 'parent', key: 'PRJ-1', projectId: 'p1', summary: 'Parent issue', parentId: null, epicId: null },
      other: { id: 'other', key: 'PRJ-3', projectId: 'p1', summary: 'Other parent', parentId: null, epicId: null },
      child: { id: 'child', key: 'PRJ-2', projectId: 'p1', summary: 'Child issue', parentId: 'parent', epicId: null, reporterId: 'u1', assigneeId: null, statusId: 'todo', labels: [] },
    };
    const qb = {
      alias: 'issue',
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(async () => [[issues.child], 1]),
    };
    const repo = {
      createQueryBuilder: jest.fn(() => qb),
      findOneBy: jest.fn(async (where: { key?: string; id?: string }) =>
        Object.values(issues).find((issue) => (where.key ? issue.key === where.key : issue.id === where.id)) ?? null),
      findOne: jest.fn(async ({ where }: { where: { key?: string; id?: string; projectId?: string } }) => {
        const found = Object.values(issues).find((issue) =>
          (where.key ? issue.key === where.key : issue.id === where.id)
          && (where.projectId === undefined || issue.projectId === where.projectId));
        return found ? { ...found } : null;
      }),
      save: jest.fn(async (value) => value),
    };
    const activityRepo = { create: jest.fn((value) => value), save: jest.fn(async (value) => value) };
    const manager = {
      getRepository: (entity: unknown) =>
        entity === IssueEntity ? repo : entity === ActivityLogEntity ? activityRepo : { findBy: async () => [] },
      query: jest.fn(async () => []),
    };
    const connections = { getEntityManager: async () => manager, runInTenantTransaction: async (fn: (em: typeof manager) => unknown) => fn(manager) };
    const projects = { findByKey: jest.fn(async () => ({ id: 'p1', key: 'PRJ' })) };
    const events = { emit: jest.fn() };
    const service = new IssuesService({} as never, connections as never, projects as never, {} as never, events as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    return { service, qb, repo, activityRepo };
  }
  const inTenant = <T>(fn: () => Promise<T>) => tenantStorage.run({ tenantId: 't1', schemaName: 'tenant_test' }, fn);

  it('lists only the children of the requested parent within the project', async () => {
    const { service, qb } = fixture();

    const result = await inTenant(() => service.findByProject('PRJ', { page: 1, perPage: 50 }, { parentId: 'parent' }));

    expect(qb.where).toHaveBeenCalledWith('issue.projectId = :projectId', { projectId: 'p1' });
    expect(qb.andWhere).toHaveBeenCalledWith('issue.parentId = :parentId', { parentId: 'parent' });
    expect(result.data.map((issue) => issue.key)).toEqual(['PRJ-2']);
  });

  it('returns the parent key and summary with a subtask', async () => {
    const { service, repo } = fixture();

    const issue = await inTenant(() => service.findByKey('PRJ-2'));

    expect(issue.parent).toEqual(expect.objectContaining({ id: 'parent', key: 'PRJ-1', summary: 'Parent issue' }));
    expect(repo.findOne).toHaveBeenCalledWith({
      where: { id: 'parent', projectId: 'p1' },
      select: { id: true, key: true, summary: true },
    });
  });

  it('does not look up a parent for an issue without one', async () => {
    const { service, repo } = fixture();

    const issue = await inTenant(() => service.findByKey('PRJ-1'));

    expect(issue.parent).toBeUndefined();
    expect(repo.findOne).not.toHaveBeenCalled();
  });

  it.each([
    ['changed', 'other', 'PRJ-3'],
    ['cleared', null, null],
  ])('records the parent in the activity log when it is %s', async (_label, parentId, newKey) => {
    const { service, activityRepo } = fixture();

    await inTenant(() => service.update('PRJ-2', { parentId }, 'u1'));

    expect(activityRepo.save).toHaveBeenCalledWith([
      expect.objectContaining({ issueId: 'child', fieldName: 'parent', oldValue: 'PRJ-1', newValue: newKey }),
    ]);
  });

  it('does not record a parent change when the parent stays the same', async () => {
    const { service, activityRepo } = fixture();

    await inTenant(() => service.update('PRJ-2', { parentId: 'parent' }, 'u1'));

    expect(activityRepo.save).not.toHaveBeenCalled();
  });
});

describe('IssuesController parent filter', () => {
  function controller() {
    const service = { findByProject: jest.fn(async () => ({ data: [], meta: {} })) };
    return { service, controller: new IssuesController(service as never, {} as never, {} as never) };
  }

  it('passes a parentId filter to the service', async () => {
    const { service, controller: issues } = controller();
    const parentId = '0d8f6f4e-55d5-4b5c-9f3a-0c8e2a7b1d11';

    await issues.findByProject('PRJ', { parentId });

    expect(service.findByProject).toHaveBeenCalledWith('PRJ', expect.anything(), { parentId });
  });

  it('rejects a parentId that is not an issue ID', async () => {
    const { service, controller: issues } = controller();

    await expect(issues.findByProject('PRJ', { parentId: 'PRJ-1' })).rejects.toThrow(BadRequestException);
    expect(service.findByProject).not.toHaveBeenCalled();
  });
});
