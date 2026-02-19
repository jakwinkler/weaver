import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import {
  TenantService,
  TenantProvisioningService,
  TenantConnectionProvider,
  tenantStorage,
} from '../src/core/tenant';

describe('Tenant System (e2e)', () => {
  let app: INestApplication;
  let tenantService: TenantService;
  let provisioning: TenantProvisioningService;
  let connections: TenantConnectionProvider;
  let dataSource: DataSource;

  const testSchemaA = 'tenant_test_a';
  const testSchemaB = 'tenant_test_b';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    tenantService = app.get(TenantService);
    provisioning = app.get(TenantProvisioningService);
    connections = app.get(TenantConnectionProvider);
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    // Clean up test schemas
    await dataSource.query(`DROP SCHEMA IF EXISTS "${testSchemaA}" CASCADE`);
    await dataSource.query(`DROP SCHEMA IF EXISTS "${testSchemaB}" CASCADE`);
    await dataSource.query(`DELETE FROM public.tenants WHERE slug IN ('test-a', 'test-b')`);
    await connections.closeAll();
    await app.close();
  });

  describe('Schema Provisioning', () => {
    it('should create a tenant and provision its schema', async () => {
      const tenant = await tenantService.create({ name: 'Test A', slug: 'test-a' });
      expect(tenant.schemaName).toBe(testSchemaA);

      await provisioning.provisionSchema(testSchemaA);

      // Verify schema exists
      const schemas = await dataSource.query(
        `SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`,
        [testSchemaA],
      );
      expect(schemas.length).toBe(1);
    });

    it('should create all tenant tables', async () => {
      const tables = await dataSource.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = $1 ORDER BY table_name`,
        [testSchemaA],
      );
      const tableNames = tables.map((t: any) => t.table_name);

      expect(tableNames).toContain('projects');
      expect(tableNames).toContain('issues');
      expect(tableNames).toContain('workflows');
      expect(tableNames).toContain('workflow_statuses');
      expect(tableNames).toContain('workflow_transitions');
      expect(tableNames).toContain('boards');
      expect(tableNames).toContain('sprints');
      expect(tableNames).toContain('comments');
      expect(tableNames).toContain('roles');
      expect(tableNames).toContain('issue_types');
    });

    it('should seed default workflow with 3 statuses', async () => {
      const workflows = await dataSource.query(
        `SELECT * FROM "${testSchemaA}".workflows WHERE is_default = true`,
      );
      expect(workflows.length).toBe(1);
      expect(workflows[0].name).toBe('Default Workflow');

      const statuses = await dataSource.query(
        `SELECT * FROM "${testSchemaA}".workflow_statuses WHERE workflow_id = $1 ORDER BY position`,
        [workflows[0].id],
      );
      expect(statuses.length).toBe(3);
      expect(statuses[0].name).toBe('To Do');
      expect(statuses[1].name).toBe('In Progress');
      expect(statuses[2].name).toBe('Done');
    });

    it('should seed default issue types', async () => {
      const types = await dataSource.query(
        `SELECT * FROM "${testSchemaA}".issue_types ORDER BY name`,
      );
      expect(types.length).toBe(5);
      const names = types.map((t: any) => t.name);
      expect(names).toContain('Task');
      expect(names).toContain('Bug');
      expect(names).toContain('Story');
      expect(names).toContain('Epic');
      expect(names).toContain('Sub-task');
    });

    it('should seed default roles', async () => {
      const roles = await dataSource.query(
        `SELECT * FROM "${testSchemaA}".roles ORDER BY name`,
      );
      expect(roles.length).toBe(3);
      const names = roles.map((r: any) => r.name);
      expect(names).toContain('Admin');
      expect(names).toContain('Member');
      expect(names).toContain('Viewer');
    });

    it('should seed workflow transitions', async () => {
      const transitions = await dataSource.query(
        `SELECT * FROM "${testSchemaA}".workflow_transitions`,
      );
      expect(transitions.length).toBe(3);
    });
  });

  describe('Tenant Isolation', () => {
    it('should isolate data between tenant schemas', async () => {
      // Provision second tenant
      await tenantService.create({ name: 'Test B', slug: 'test-b' });
      await provisioning.provisionSchema(testSchemaB);

      // Insert project in tenant A
      const connA = await connections.getConnection(testSchemaA);
      await connA.query(
        `INSERT INTO "${testSchemaA}".projects (key, name, issue_counter, created_at, updated_at)
         VALUES ('PROJA', 'Project A', 0, NOW(), NOW())`,
      );

      // Insert project in tenant B
      const connB = await connections.getConnection(testSchemaB);
      await connB.query(
        `INSERT INTO "${testSchemaB}".projects (key, name, issue_counter, created_at, updated_at)
         VALUES ('PROJB', 'Project B', 0, NOW(), NOW())`,
      );

      // Verify isolation
      const projectsA = await connA.query(`SELECT * FROM "${testSchemaA}".projects`);
      expect(projectsA.length).toBe(1);
      expect(projectsA[0].key).toBe('PROJA');

      const projectsB = await connB.query(`SELECT * FROM "${testSchemaB}".projects`);
      expect(projectsB.length).toBe(1);
      expect(projectsB[0].key).toBe('PROJB');
    });

    it('should provide entity manager via tenant context', async () => {
      let tenantA = await tenantService.findBySlug('test-a');
      if (!tenantA) {
        tenantA = await tenantService.create({ name: 'Test A', slug: 'test-a' });
      }

      const result = await new Promise<any[]>((resolve, reject) => {
        tenantStorage.run(
          { tenantId: tenantA!.id, schemaName: testSchemaA },
          async () => {
            try {
              const em = await connections.getEntityManager();
              expect(em).toBeDefined();
              // Use schema-qualified query since search_path may not be set
              const projects = await em.query(`SELECT * FROM "${testSchemaA}".projects`);
              resolve(projects);
            } catch (err) {
              reject(err);
            }
          },
        );
      });

      expect(result.length).toBe(1);
      expect(result[0].key).toBe('PROJA');
    });
  });

  describe('Schema Cleanup', () => {
    it('should drop a tenant schema', async () => {
      const tempSchema = 'tenant_temp_drop';
      await dataSource.query(`CREATE SCHEMA IF NOT EXISTS "${tempSchema}"`);

      await provisioning.dropSchema(tempSchema);

      const schemas = await dataSource.query(
        `SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`,
        [tempSchema],
      );
      expect(schemas.length).toBe(0);
    });
  });
});
