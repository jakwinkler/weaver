import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantConnectionProvider, TENANT_ENTITIES } from './tenant-connection.provider';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TenantProvisioningService {
  private readonly logger = new Logger(TenantProvisioningService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly tenantConnections: TenantConnectionProvider,
    private readonly config: ConfigService,
  ) {}

  async provisionSchema(schemaName: string): Promise<void> {
    this.logger.log(`Provisioning schema: ${schemaName}`);

    // Create the schema
    await this.dataSource.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

    // Create tenant tables using synchronize on a temporary connection
    const tempDs = new DataSource({
      type: 'postgres',
      host: this.config.get('DATABASE_HOST', 'localhost'),
      port: this.config.get<number>('DATABASE_PORT', 5432),
      username: this.config.get('DATABASE_USER', 'weaver'),
      password: this.config.get('DATABASE_PASSWORD', 'weaver_dev'),
      database: this.config.get('DATABASE_NAME', 'weaver'),
      schema: schemaName,
      entities: TENANT_ENTITIES,
      synchronize: true,
      logging: false,
    });

    await tempDs.initialize();
    await tempDs.destroy();

    // Create GIN index for custom fields
    await this.dataSource.query(
      `CREATE INDEX IF NOT EXISTS "IDX_issue_custom_fields" ON "${schemaName}"."issues" USING GIN ("custom_fields")`,
    );

    // Create raw SQL tables not managed by TypeORM entities
    await this.createRawTables(schemaName);

    // Seed default data
    await this.seedDefaults(schemaName);

    this.logger.log(`Schema provisioned: ${schemaName}`);
  }

  private async createRawTables(schemaName: string): Promise<void> {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."teams" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."team_members" (
        team_id UUID NOT NULL REFERENCES "${schemaName}"."teams"(id) ON DELETE CASCADE,
        user_id UUID NOT NULL,
        joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (team_id, user_id)
      )
    `);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."webhook_deliveries" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        webhook_id UUID NOT NULL REFERENCES "${schemaName}"."webhooks"(id) ON DELETE CASCADE,
        event VARCHAR(255) NOT NULL,
        payload JSONB NOT NULL DEFAULT '{}',
        response_status INTEGER,
        response_body TEXT,
        success BOOLEAN NOT NULL DEFAULT false,
        delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  private async seedDefaults(schemaName: string): Promise<void> {
    const conn = await this.tenantConnections.getConnection(schemaName);
    const manager = conn.manager;

    // Seed default workflow
    const workflow = await manager.query(
      `INSERT INTO "${schemaName}"."workflows" (name, is_default, created_at, updated_at)
       VALUES ('Default Workflow', true, NOW(), NOW())
       RETURNING id`,
    );
    const workflowId = workflow[0].id;

    // Seed default statuses
    const statuses = [
      { name: 'To Do', category: 'todo', color: '#6B7280', isInitial: true, isTerminal: false, position: 0 },
      { name: 'In Progress', category: 'in_progress', color: '#3B82F6', isInitial: false, isTerminal: false, position: 1 },
      { name: 'Done', category: 'done', color: '#10B981', isInitial: false, isTerminal: true, position: 2 },
    ];

    const statusIds: string[] = [];
    for (const s of statuses) {
      const result = await manager.query(
        `INSERT INTO "${schemaName}"."workflow_statuses"
         (workflow_id, name, category, color, is_initial, is_terminal, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [workflowId, s.name, s.category, s.color, s.isInitial, s.isTerminal, s.position],
      );
      statusIds.push(result[0].id);
    }

    // Seed transitions: To Do -> In Progress, In Progress -> Done, Done -> To Do
    const transitions = [
      { from: 0, to: 1, name: 'Start Progress' },
      { from: 1, to: 2, name: 'Done' },
      { from: 2, to: 0, name: 'Reopen' },
    ];

    for (const t of transitions) {
      await manager.query(
        `INSERT INTO "${schemaName}"."workflow_transitions"
         (workflow_id, from_status_id, to_status_id, name, conditions, validators, post_functions)
         VALUES ($1, $2, $3, $4, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb)`,
        [workflowId, statusIds[t.from], statusIds[t.to], t.name],
      );
    }

    // Seed default issue types
    const issueTypes = [
      { name: 'Task', slug: 'task', isSubtask: false },
      { name: 'Bug', slug: 'bug', isSubtask: false },
      { name: 'Story', slug: 'story', isSubtask: false },
      { name: 'Epic', slug: 'epic', isSubtask: false },
      { name: 'Sub-task', slug: 'sub-task', isSubtask: true },
    ];

    for (const it of issueTypes) {
      await manager.query(
        `INSERT INTO "${schemaName}"."issue_types" (name, slug, is_subtask, created_at)
         VALUES ($1, $2, $3, NOW())`,
        [it.name, it.slug, it.isSubtask],
      );
    }

    // Seed default roles (dot-notation permission format)
    const roles = [
      { name: 'admin', permissions: { '*': true }, isSystem: true },
      {
        name: 'member',
        permissions: {
          'projects.read': true,
          'issues.create': true, 'issues.read': true, 'issues.update': true,
          'issues.transition': true, 'issues.assign': true,
          'comments.create': true, 'comments.read': true, 'comments.update': true,
          'sprints.read': true, 'custom_fields.read': true,
          'timer.allow': true,
        },
        isSystem: true,
      },
      {
        name: 'viewer',
        permissions: {
          'projects.read': true, 'issues.read': true,
          'comments.read': true, 'sprints.read': true,
        },
        isSystem: true,
      },
    ];

    for (const r of roles) {
      await manager.query(
        `INSERT INTO "${schemaName}"."roles" (name, permissions, is_system, created_at)
         VALUES ($1, $2::jsonb, $3, NOW())`,
        [r.name, JSON.stringify(r.permissions), r.isSystem],
      );
    }
  }

  async dropSchema(schemaName: string): Promise<void> {
    this.logger.log(`Dropping schema: ${schemaName}`);
    await this.tenantConnections.closeConnection(schemaName);
    await this.dataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  }
}
