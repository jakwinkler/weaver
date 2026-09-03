import { In, Repository } from 'typeorm';
import { TenantEntity } from '@weaver/db';

export const DATABASE_TEST_TENANT_SLUGS = [
  'test-org-db',
  'unique-slug-test',
];

export async function cleanupDatabaseTestTenants(
  tenantRepo: Repository<TenantEntity>,
): Promise<void> {
  await tenantRepo.delete({ slug: In(DATABASE_TEST_TENANT_SLUGS) });
}
