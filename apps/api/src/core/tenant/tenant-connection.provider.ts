import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  ProjectEntity,
  ProjectMemberEntity,
  ProjectIssueTypeEntity,
  IssueEntity,
  IssueTypeEntity,
  IssueLinkEntity,
  WorkflowEntity,
  WorkflowStatusEntity,
  WorkflowTransitionEntity,
  BoardEntity,
  SprintEntity,
  CommentEntity,
  ActivityLogEntity,
  RoleEntity,
  CustomFieldDefinitionEntity,
  NotificationEntity,
  WebhookEntity,
  SavedFilterEntity,
  TimeEntryEntity,
  AttachmentEntity,
  ProjectPluginEntity,
} from '@weaver/db';
import { requireTenantContext } from './tenant.context';

export const TENANT_ENTITIES = [
  ProjectEntity,
  ProjectMemberEntity,
  ProjectIssueTypeEntity,
  IssueEntity,
  IssueTypeEntity,
  IssueLinkEntity,
  WorkflowEntity,
  WorkflowStatusEntity,
  WorkflowTransitionEntity,
  BoardEntity,
  SprintEntity,
  CommentEntity,
  ActivityLogEntity,
  RoleEntity,
  CustomFieldDefinitionEntity,
  NotificationEntity,
  WebhookEntity,
  SavedFilterEntity,
  TimeEntryEntity,
  AttachmentEntity,
  ProjectPluginEntity,
];

@Injectable()
export class TenantConnectionProvider {
  private connections = new Map<string, DataSource>();
  private initializing = new Map<string, Promise<DataSource>>();

  constructor(private readonly config: ConfigService) {}

  async getConnection(schemaName: string): Promise<DataSource> {
    const existing = this.connections.get(schemaName);
    if (existing?.isInitialized) {
      return existing;
    }

    const pending = this.initializing.get(schemaName);
    if (pending) {
      return pending;
    }

    const initialization = this.initializeConnection(schemaName);
    this.initializing.set(schemaName, initialization);
    try {
      return await initialization;
    } finally {
      if (this.initializing.get(schemaName) === initialization) {
        this.initializing.delete(schemaName);
      }
    }
  }

  private async initializeConnection(schemaName: string): Promise<DataSource> {
    const ds = new DataSource({
      type: 'postgres',
      host: this.config.get('DATABASE_HOST', 'localhost'),
      port: this.config.get<number>('DATABASE_PORT', 5432),
      username: this.config.get('DATABASE_USER', 'weaver'),
      password: this.config.get('DATABASE_PASSWORD', 'weaver_dev'),
      database: this.config.get('DATABASE_NAME', 'weaver'),
      schema: schemaName,
      entities: TENANT_ENTITIES,
      synchronize: this.config.get('NODE_ENV') === 'development',
      logging: this.config.get('DATABASE_LOGGING') === 'true',
    });

    try {
      await ds.initialize();
      this.connections.set(schemaName, ds);
      return ds;
    } catch (error) {
      if (ds.isInitialized) {
        await ds.destroy();
      }
      throw error;
    }
  }

  async getEntityManager(): Promise<EntityManager> {
    const { schemaName } = requireTenantContext();
    const ds = await this.getConnection(schemaName);
    return ds.manager;
  }

  async runInTenantTransaction<T>(
    callback: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    const { schemaName } = requireTenantContext();
    const ds = await this.getConnection(schemaName);
    const queryRunner = ds.createQueryRunner();
    let transactionStarted = false;

    await queryRunner.connect();
    try {
      await queryRunner.startTransaction();
      transactionStarted = true;
      const quotedSchema = `"${schemaName.replace(/"/g, '""')}"`;
      await queryRunner.query(`SET LOCAL search_path TO ${quotedSchema}`);
      const result = await callback(queryRunner.manager);
      await queryRunner.commitTransaction();
      return result;
    } catch (error) {
      if (transactionStarted) {
        await queryRunner.rollbackTransaction();
      }
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async closeAll(): Promise<void> {
    await Promise.allSettled(this.initializing.values());
    for (const [, ds] of this.connections) {
      if (ds.isInitialized) {
        await ds.destroy();
      }
    }
    this.connections.clear();
    this.initializing.clear();
  }

  async closeConnection(schemaName: string): Promise<void> {
    await this.initializing.get(schemaName)?.catch(() => undefined);
    const ds = this.connections.get(schemaName);
    if (ds?.isInitialized) {
      await ds.destroy();
    }
    this.connections.delete(schemaName);
  }
}
