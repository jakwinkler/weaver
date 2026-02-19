import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  ProjectEntity,
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
} from '@weaver/db';
import { requireTenantContext } from './tenant.context';

export const TENANT_ENTITIES = [
  ProjectEntity,
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
];

@Injectable()
export class TenantConnectionProvider {
  private connections = new Map<string, DataSource>();

  constructor(private readonly config: ConfigService) {}

  async getConnection(schemaName: string): Promise<DataSource> {
    const existing = this.connections.get(schemaName);
    if (existing?.isInitialized) {
      return existing;
    }

    const ds = new DataSource({
      type: 'postgres',
      host: this.config.get('DATABASE_HOST', 'localhost'),
      port: this.config.get<number>('DATABASE_PORT', 5432),
      username: this.config.get('DATABASE_USER', 'weaver'),
      password: this.config.get('DATABASE_PASSWORD', 'weaver_dev'),
      database: this.config.get('DATABASE_NAME', 'weaver'),
      schema: schemaName,
      entities: TENANT_ENTITIES,
      synchronize: false,
      logging: this.config.get('DATABASE_LOGGING') === 'true',
    });

    await ds.initialize();
    this.connections.set(schemaName, ds);
    return ds;
  }

  async getEntityManager(): Promise<EntityManager> {
    const { schemaName } = requireTenantContext();
    const ds = await this.getConnection(schemaName);
    return ds.manager;
  }

  async closeAll(): Promise<void> {
    for (const [, ds] of this.connections) {
      if (ds.isInitialized) {
        await ds.destroy();
      }
    }
    this.connections.clear();
  }

  async closeConnection(schemaName: string): Promise<void> {
    const ds = this.connections.get(schemaName);
    if (ds?.isInitialized) {
      await ds.destroy();
    }
    this.connections.delete(schemaName);
  }
}
