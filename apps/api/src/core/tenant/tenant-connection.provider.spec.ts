import { DataSource, EntityManager } from 'typeorm';
import { TenantConnectionProvider } from './tenant-connection.provider';
import { tenantStorage } from './tenant.context';
jest.mock('@weaver/db', () => ({ ...jest.requireActual('@weaver/db'), runAutomaticTimeCoreMigration: jest.fn().mockResolvedValue(undefined), runReviewReliabilityMigration: jest.fn().mockResolvedValue(undefined) }));

describe('TenantConnectionProvider raw query isolation', () => {
  it.each([false, true])('shares nested transactions and dispatches only after commit (rollback=%s)', async (rollback) => {
    const manager = {} as EntityManager;
    const runner = {
      manager, connect: jest.fn(), startTransaction: jest.fn(), query: jest.fn(),
      commitTransaction: jest.fn(), rollbackTransaction: jest.fn(), release: jest.fn(),
    };
    const provider = new TenantConnectionProvider({ get: jest.fn() } as never);
    const connection = jest.spyOn(provider, 'getConnection').mockResolvedValue({
      manager: { outside: true }, createQueryRunner: () => runner,
    } as never);
    const dispatched = jest.fn();
    const operation = tenantStorage.run({ tenantId: 'tenant-a', schemaName: 'tenant_a' }, () =>
      provider.runInTenantTransaction(async (outer) => {
        expect(await provider.getEntityManager()).toBe(outer);
        await provider.runInTenantTransaction(async (inner) => { expect(inner).toBe(outer); });
        expect((provider as any).deferUntilCommit(async () => {
          expect(runner.commitTransaction).toHaveBeenCalled();
          expect(runner.release).toHaveBeenCalled();
          dispatched();
        })).toBe(true);
        expect(dispatched).not.toHaveBeenCalled();
        if (rollback) throw new Error('abort');
      }),
    );
    if (rollback) await expect(operation).rejects.toThrow('abort');
    else await operation;
    expect(connection).toHaveBeenCalledTimes(1);
    expect(dispatched).toHaveBeenCalledTimes(rollback ? 0 : 1);
    expect(runner.rollbackTransaction).toHaveBeenCalledTimes(rollback ? 1 : 0);
  });
  it('shares one pool initialization across concurrent first requests', async () => {
    let releaseInitialization!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseInitialization = resolve;
    });
    const initialize = jest
      .spyOn(DataSource.prototype, 'initialize')
      .mockImplementation(async function (this: DataSource) {
        await gate;
        (this as any).isInitialized = true;
        return this;
      });
    const config = {
      get: jest.fn((_key: string, fallback: unknown) => fallback),
    };
    const provider = new TenantConnectionProvider(config as never);

    try {
      const first = provider.getConnection('tenant_concurrent');
      const second = provider.getConnection('tenant_concurrent');
      releaseInitialization();
      const [firstConnection, secondConnection] = await Promise.all([first, second]);

      expect(firstConnection === secondConnection).toBe(true);
      expect(initialize).toHaveBeenCalledTimes(1);
    } finally {
      initialize.mockRestore();
    }
  });

  it('uses one checked-out connection and a tenant-only local search path', async () => {
    const manager = { query: jest.fn().mockResolvedValue([{ result: 1 }]) } as unknown as EntityManager;
    const queryRunner = {
      manager,
      connect: jest.fn(),
      startTransaction: jest.fn(),
      query: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
    };
    const provider = new TenantConnectionProvider({ get: jest.fn() } as never);
    jest.spyOn(provider, 'getConnection').mockResolvedValue({
      createQueryRunner: () => queryRunner,
    } as never);

    const result = await tenantStorage.run(
      { tenantId: '7ae66f2a-8358-47fe-82c4-d9d915b26122', schemaName: 'tenant_safe' },
      () => provider.runInTenantTransaction((tenantManager) => tenantManager.query('SELECT 1')),
    );

    expect(result).toEqual([{ result: 1 }]);
    expect(queryRunner.query).toHaveBeenCalledWith(
      'SET LOCAL search_path TO "tenant_safe"',
    );
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalled();
  });
});
