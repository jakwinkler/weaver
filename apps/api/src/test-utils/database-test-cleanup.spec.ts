import { In } from 'typeorm';
import {
  cleanupDatabaseTestTenants,
  DATABASE_TEST_TENANT_SLUGS,
} from './database-test-cleanup';

describe('database test cleanup', () => {
  it('deletes only tenants owned by the database test suite', async () => {
    const execute = jest.fn().mockResolvedValue(undefined);
    const from = jest.fn().mockReturnValue({ execute });
    const deleteQuery = jest.fn().mockReturnValue({ from });
    const tenantRepo = {
      delete: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn().mockReturnValue({ delete: deleteQuery }),
    };

    await cleanupDatabaseTestTenants(tenantRepo as never);

    expect(tenantRepo.delete).toHaveBeenCalledWith({
      slug: In(DATABASE_TEST_TENANT_SLUGS),
    });
    expect(tenantRepo.createQueryBuilder).not.toHaveBeenCalled();
  });
});
