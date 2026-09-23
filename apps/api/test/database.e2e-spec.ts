import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { TenantEntity } from '@weaver/db';
import { AppModule } from '../src/app.module';
import { cleanupDatabaseTestTenants } from '../src/test-utils/database-test-cleanup';

describe('Database Module (e2e)', () => {
  let app: INestApplication;
  let tenantRepo: Repository<TenantEntity>;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    tenantRepo = app.get(getRepositoryToken(TenantEntity));
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await cleanupDatabaseTestTenants(tenantRepo);
    }
    await app.close();
  });

  it('should connect to the database', async () => {
    const result = await tenantRepo.query('SELECT 1 as value');
    expect(result[0].value).toBe(1);
  });

  it('should create public schema tables (tenants)', async () => {
    const tables = await tenantRepo.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tenants'`,
    );
    expect(tables.length).toBe(1);
  });

  it('should insert and query a tenant', async () => {
    const tenant = tenantRepo.create({
      name: 'Test Org',
      slug: 'test-org-db',
      schemaName: 'tenant_test_org_db',
      plan: 'free',
      settings: {},
    });
    const saved = await tenantRepo.save(tenant);

    expect(saved.id).toBeDefined();
    expect(saved.createdAt).toBeInstanceOf(Date);

    const found = await tenantRepo.findOneBy({ slug: 'test-org-db' });
    expect(found).toBeDefined();
    expect(found!.name).toBe('Test Org');
    expect(found!.schemaName).toBe('tenant_test_org_db');

    await tenantRepo.delete(saved.id);
  });

  it('should enforce unique slug constraint', async () => {
    const tenant1 = tenantRepo.create({
      name: 'Org A',
      slug: 'unique-slug-test',
      schemaName: 'tenant_org_a',
    });
    await tenantRepo.save(tenant1);

    const tenant2 = tenantRepo.create({
      name: 'Org B',
      slug: 'unique-slug-test',
      schemaName: 'tenant_org_b',
    });

    await expect(tenantRepo.save(tenant2)).rejects.toThrow();

    await tenantRepo.delete(tenant1.id);
  });
});
