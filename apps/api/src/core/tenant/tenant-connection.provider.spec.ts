import { EntityManager } from 'typeorm';
import { TenantConnectionProvider } from './tenant-connection.provider';
import { tenantStorage } from './tenant.context';

describe('TenantConnectionProvider raw query isolation', () => {
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
