import 'reflect-metadata';
import { getMetadataArgsStorage } from 'typeorm';
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
} from '../src/entities/tenant';

describe('Tenant Schema Entities', () => {
  const storage = getMetadataArgsStorage();

  const entityCases: [string, new () => object, string][] = [
    ['ProjectEntity', ProjectEntity, 'projects'],
    ['IssueEntity', IssueEntity, 'issues'],
    ['IssueTypeEntity', IssueTypeEntity, 'issue_types'],
    ['IssueLinkEntity', IssueLinkEntity, 'issue_links'],
    ['WorkflowEntity', WorkflowEntity, 'workflows'],
    ['WorkflowStatusEntity', WorkflowStatusEntity, 'workflow_statuses'],
    ['WorkflowTransitionEntity', WorkflowTransitionEntity, 'workflow_transitions'],
    ['BoardEntity', BoardEntity, 'boards'],
    ['SprintEntity', SprintEntity, 'sprints'],
    ['CommentEntity', CommentEntity, 'comments'],
    ['ActivityLogEntity', ActivityLogEntity, 'activity_logs'],
    ['RoleEntity', RoleEntity, 'roles'],
    ['CustomFieldDefinitionEntity', CustomFieldDefinitionEntity, 'custom_field_definitions'],
    ['NotificationEntity', NotificationEntity, 'notifications'],
    ['WebhookEntity', WebhookEntity, 'webhooks'],
    ['SavedFilterEntity', SavedFilterEntity, 'saved_filters'],
    ['TimeEntryEntity', TimeEntryEntity, 'time_entries'],
    ['AttachmentEntity', AttachmentEntity, 'attachments'],
  ];

  it.each(entityCases)('%s should be registered with table name %s', (_name, entity, tableName) => {
    const table = storage.tables.find((t) => t.target === entity);
    expect(table).toBeDefined();
    expect(table!.name).toBe(tableName);
  });

  it.each(entityCases)('%s should NOT have a schema set', (_name, entity) => {
    const table = storage.tables.find((t) => t.target === entity);
    expect(table!.schema).toBeUndefined();
  });

  it.each(entityCases)('%s should have a uuid primary key', (_name, entity) => {
    const generated = storage.generations.find((g) => g.target === entity);
    expect(generated).toBeDefined();
    expect(generated!.strategy).toBe('uuid');
  });

  describe('ProjectEntity', () => {
    it('should have key, name, issueCounter columns', () => {
      const columns = storage.columns
        .filter((c) => c.target === ProjectEntity)
        .map((c) => c.propertyName);
      expect(columns).toContain('key');
      expect(columns).toContain('name');
      expect(columns).toContain('issueCounter');
    });

    it('should have OneToMany relations', () => {
      const relations = storage.relations
        .filter((r) => r.target === ProjectEntity && r.relationType === 'one-to-many');
      expect(relations.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('IssueEntity', () => {
    it('should have all required columns', () => {
      const columns = storage.columns
        .filter((c) => c.target === IssueEntity)
        .map((c) => c.propertyName);
      expect(columns).toContain('projectId');
      expect(columns).toContain('key');
      expect(columns).toContain('summary');
      expect(columns).toContain('statusId');
      expect(columns).toContain('priority');
      expect(columns).toContain('reporterId');
      expect(columns).toContain('customFields');
      expect(columns).toContain('labels');
      expect(columns).toContain('sortOrder');
    });

    it('should have indexes on projectId and statusId', () => {
      const indices = storage.indices.filter((i) => i.target === IssueEntity);
      expect(indices.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('WorkflowEntity', () => {
    it('should have OneToMany to statuses and transitions', () => {
      const relations = storage.relations
        .filter((r) => r.target === WorkflowEntity && r.relationType === 'one-to-many');
      const names = relations.map((r) => r.propertyName);
      expect(names).toContain('statuses');
      expect(names).toContain('transitions');
    });
  });

  describe('WorkflowTransitionEntity', () => {
    it('should have relations to workflow, fromStatus, toStatus', () => {
      const relations = storage.relations
        .filter((r) => r.target === WorkflowTransitionEntity && r.relationType === 'many-to-one');
      const names = relations.map((r) => r.propertyName);
      expect(names).toContain('workflow');
      expect(names).toContain('fromStatus');
      expect(names).toContain('toStatus');
    });

    it('should have jsonb columns for conditions, validators, postFunctions', () => {
      const columns = storage.columns
        .filter((c) => c.target === WorkflowTransitionEntity)
        .map((c) => c.propertyName);
      expect(columns).toContain('conditions');
      expect(columns).toContain('validators');
      expect(columns).toContain('postFunctions');
    });
  });

  describe('IssueLinkEntity', () => {
    it('should have unique constraint on link combination', () => {
      const uniques = storage.uniques.filter((u) => u.target === IssueLinkEntity);
      expect(uniques.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('CommentEntity', () => {
    it('should have ManyToOne relation to issue', () => {
      const relations = storage.relations
        .filter((r) => r.target === CommentEntity && r.relationType === 'many-to-one');
      const names = relations.map((r) => r.propertyName);
      expect(names).toContain('issue');
    });
  });
});
