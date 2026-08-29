import 'reflect-metadata';
import { getMetadataArgsStorage } from 'typeorm';
import {
  TenantEntity,
  UserEntity,
  TenantMembershipEntity,
  ApiKeyEntity,
  InstalledPluginEntity,
} from '../src/entities/public';

describe('Public Schema Entities', () => {
  const storage = getMetadataArgsStorage();

  describe('TenantEntity', () => {
    it('should be registered as an entity', () => {
      const table = storage.tables.find((t) => t.target === TenantEntity);
      expect(table).toBeDefined();
      expect(table!.name).toBe('tenants');
      expect(table!.schema).toBe('public');
    });

    it('should have required columns', () => {
      const columns = storage.columns.filter((c) => c.target === TenantEntity);
      const columnNames = columns.map((c) => c.propertyName);
      expect(columnNames).toContain('name');
      expect(columnNames).toContain('slug');
      expect(columnNames).toContain('schemaName');
      expect(columnNames).toContain('plan');
      expect(columnNames).toContain('settings');
    });

    it('should have a uuid primary key', () => {
      const generated = storage.generations.find((g) => g.target === TenantEntity);
      expect(generated).toBeDefined();
      expect(generated!.strategy).toBe('uuid');
    });

    it('should have unique index on slug', () => {
      const indices = storage.indices.filter((i) => i.target === TenantEntity);
      const slugIndex = indices.find((i) => i.columns?.includes('slug'));
      expect(slugIndex).toBeDefined();
      expect(slugIndex!.unique).toBe(true);
    });
  });

  describe('UserEntity', () => {
    it('should be registered as an entity', () => {
      const table = storage.tables.find((t) => t.target === UserEntity);
      expect(table).toBeDefined();
      expect(table!.name).toBe('users');
      expect(table!.schema).toBe('public');
    });

    it('should have required columns', () => {
      const columns = storage.columns.filter((c) => c.target === UserEntity);
      const columnNames = columns.map((c) => c.propertyName);
      expect(columnNames).toContain('email');
      expect(columnNames).toContain('displayName');
      expect(columnNames).toContain('passwordHash');
      expect(columnNames).toContain('authProvider');
      expect(columnNames).toContain('authProviders');
    });

    it('should have unique index on email', () => {
      const indices = storage.indices.filter((i) => i.target === UserEntity);
      const emailIndex = indices.find((i) => i.columns?.includes('email'));
      expect(emailIndex).toBeDefined();
      expect(emailIndex!.unique).toBe(true);
    });
  });

  describe('TenantMembershipEntity', () => {
    it('should be registered as an entity', () => {
      const table = storage.tables.find((t) => t.target === TenantMembershipEntity);
      expect(table).toBeDefined();
      expect(table!.name).toBe('tenant_memberships');
    });

    it('should have composite primary key', () => {
      const columns = storage.columns.filter(
        (c) => c.target === TenantMembershipEntity && c.options.primary,
      );
      expect(columns.length).toBe(2);
      const names = columns.map((c) => c.propertyName);
      expect(names).toContain('tenantId');
      expect(names).toContain('userId');
    });

    it('should have role column', () => {
      const columns = storage.columns.filter((c) => c.target === TenantMembershipEntity);
      const roleCol = columns.find((c) => c.propertyName === 'role');
      expect(roleCol).toBeDefined();
    });

    it('should have relations to tenant and user', () => {
      const relations = storage.relations.filter(
        (r) => r.target === TenantMembershipEntity,
      );
      expect(relations.length).toBe(2);
      const targetNames = relations.map((r) => r.propertyName);
      expect(targetNames).toContain('tenant');
      expect(targetNames).toContain('user');
    });
  });

  describe('ApiKeyEntity', () => {
    it('should be registered as an entity', () => {
      const table = storage.tables.find((t) => t.target === ApiKeyEntity);
      expect(table).toBeDefined();
      expect(table!.name).toBe('api_keys');
    });

    it('should have required columns', () => {
      const columns = storage.columns.filter((c) => c.target === ApiKeyEntity);
      const columnNames = columns.map((c) => c.propertyName);
      expect(columnNames).toContain('tenantId');
      expect(columnNames).toContain('userId');
      expect(columnNames).toContain('name');
      expect(columnNames).toContain('keyHash');
      expect(columnNames).toContain('scopes');
    });

    it('should have unique index on keyHash', () => {
      const indices = storage.indices.filter((i) => i.target === ApiKeyEntity);
      const keyHashIndex = indices.find((i) => i.columns?.includes('keyHash'));
      expect(keyHashIndex).toBeDefined();
      expect(keyHashIndex!.unique).toBe(true);
    });
  });

  describe('InstalledPluginEntity', () => {
    it('should be registered as an entity', () => {
      const table = storage.tables.find((t) => t.target === InstalledPluginEntity);
      expect(table).toBeDefined();
      expect(table!.name).toBe('installed_plugins');
    });

    it('should have required columns', () => {
      const columns = storage.columns.filter((c) => c.target === InstalledPluginEntity);
      const columnNames = columns.map((c) => c.propertyName);
      expect(columnNames).toContain('tenantId');
      expect(columnNames).toContain('pluginId');
      expect(columnNames).toContain('version');
      expect(columnNames).toContain('enabled');
      expect(columnNames).toContain('settings');
    });

    it('should have unique composite index on tenantId + pluginId', () => {
      const indices = storage.indices.filter((i) => i.target === InstalledPluginEntity);
      const compositeIndex = indices.find((i) => i.unique === true);
      expect(compositeIndex).toBeDefined();
    });
  });
});
