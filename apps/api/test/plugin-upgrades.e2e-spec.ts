import { Logger } from '@nestjs/common';
import type { InstalledPluginEntity } from '@weaver/db';
import type { PluginContext, PluginManifest } from '@weaver/sdk';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Client } from 'pg';
import { requireTenantContext } from '../src/core/tenant';
import { PluginRegistryService } from '../src/plugins/plugin-registry.service';

describe('Plugin upgrades (e2e)', () => {
  const pluginId = '@weaver/plugin-upgrade-test';
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const schemaName = 'tenant_plugin_upgrade_test';

  let installed: InstalledPluginEntity;
  let manifest: PluginManifest;
  let onUpgrade: jest.Mock;
  let runMigration: jest.Mock;
  let repo: {
    find: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
    manager: { transaction: jest.Mock };
  };
  let loader: {
    getManifest: jest.Mock;
    getModule: jest.Mock;
    getPluginDir: jest.Mock;
  };
  let contextFactory: { create: jest.Mock };
  let service: PluginRegistryService;
  let pluginDir: string;

  beforeEach(() => {
    pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weaver-plugin-upgrade-'));
    installed = {
      id: '22222222-2222-4222-8222-222222222222',
      tenantId,
      pluginId,
      version: '1.0.0',
      enabled: true,
      settings: { existing: true },
      installedAt: new Date('2026-08-29T12:00:00.000Z'),
      tenant: {
        id: tenantId,
        schemaName,
      },
    } as InstalledPluginEntity;
    manifest = {
      id: pluginId,
      name: 'Upgrade Test Plugin',
      version: '1.1.0',
      entrypoints: { server: './src/server/index.ts' },
      permissions: [],
    };
    onUpgrade = jest.fn().mockResolvedValue(undefined);
    runMigration = jest.fn().mockResolvedValue(undefined);
    repo = {
      find: jest.fn().mockResolvedValue([installed]),
      findOne: jest.fn(async ({ where }) => (await repo.find()).find((row: InstalledPluginEntity) => row.pluginId === where.pluginId)),
      save: jest.fn(async (plugin: InstalledPluginEntity) => plugin),
      manager: { transaction: jest.fn(async (callback) => callback({ getRepository: () => repo, query: jest.fn() })) },
    };
    loader = {
      getManifest: jest.fn(() => manifest),
      getModule: jest.fn().mockResolvedValue({ plugin: { onUpgrade } }),
      getPluginDir: jest.fn(() => pluginDir),
    };
    const context = {
      db: { runMigration },
      logger: {},
      settings: installed.settings,
      tenant: { id: tenantId, slug: '', schemaName },
    } as unknown as PluginContext;
    contextFactory = {
      create: jest.fn().mockImplementation(async () => {
        expect(requireTenantContext()).toEqual({ tenantId, schemaName });
        return context;
      }),
    };
    service = new PluginRegistryService(
      repo as never,
      loader as never,
      contextFactory as never,
    );
  });

  afterEach(() => {
    fs.rmSync(pluginDir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it('triggers onUpgrade on startup and persists the new version', async () => {
    await service.onApplicationBootstrap();

    expect(contextFactory.create).toHaveBeenCalledWith(pluginId, installed.settings, undefined,
      expect.objectContaining({ manager: expect.any(Object), capabilityState: { installed: true, enabled: true } }));
    expect(onUpgrade).toHaveBeenCalledWith(
      '1.0.0',
      '1.1.0',
      expect.objectContaining({
        tenant: expect.objectContaining({ id: tenantId, schemaName }),
      }),
    );
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ version: '1.1.0' }));
    expect(installed.version).toBe('1.1.0');
  });

  it('runs only newer versioned migrations in semantic-version order', async () => {
    fs.writeFileSync(path.join(pluginDir, 'already-applied.sql'), 'SELECT 1;');
    fs.writeFileSync(path.join(pluginDir, 'later.sql'), 'SELECT 3;');
    fs.writeFileSync(path.join(pluginDir, 'next.sql'), 'SELECT 2;');
    fs.writeFileSync(path.join(pluginDir, 'future.sql'), 'SELECT 4;');
    manifest.version = '1.10.0';
    manifest.migrations = [
      { version: '1.0.0', sql: 'already-applied.sql' },
      { version: '1.10.0', sql: 'later.sql' },
      { version: '1.2.0', sql: 'next.sql' },
      { version: '2.0.0', sql: 'future.sql' },
      'legacy-install-only.sql',
    ];

    await service.onApplicationBootstrap();

    expect(runMigration.mock.calls.map(([sql]) => sql)).toEqual(['SELECT 2;', 'SELECT 3;']);
    expect(onUpgrade).toHaveBeenCalledWith('1.0.0', '1.10.0', expect.any(Object));
    expect(installed.version).toBe('1.10.0');
  });

  it('does not update the version when onUpgrade fails and records the failure', async () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    onUpgrade.mockRejectedValue(new Error('upgrade hook failed'));

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();

    expect(repo.save).not.toHaveBeenCalled();
    expect(installed.version).toBe('1.0.0');
    expect(service.getUpgradeLog()).toEqual([
      expect.objectContaining({
        pluginId,
        fromVersion: '1.0.0',
        toVersion: '1.1.0',
        success: false,
        error: 'upgrade hook failed',
        timestamp: expect.any(String),
      }),
    ]);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('upgrade hook failed'));

    onUpgrade.mockResolvedValue(undefined);
    await service.onApplicationBootstrap();

    expect(onUpgrade).toHaveBeenCalledTimes(2);
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ version: '1.1.0' }));
    expect(installed.version).toBe('1.1.0');
  });

  it('records a successful upgrade and skips equal or older manifests', async () => {
    await service.onApplicationBootstrap();

    expect(service.getUpgradeLog()).toEqual([
      expect.objectContaining({
        pluginId,
        fromVersion: '1.0.0',
        toVersion: '1.1.0',
        success: true,
        error: null,
        timestamp: expect.any(String),
      }),
    ]);

    repo.save.mockClear();
    onUpgrade.mockClear();
    manifest.version = '1.0.0';
    installed.version = '1.1.0';

    await service.onApplicationBootstrap();

    expect(repo.save).not.toHaveBeenCalled();
    expect(onUpgrade).not.toHaveBeenCalled();
  });

  it('continues upgrading other plugins after one plugin fails', async () => {
    const nextPluginId = '@weaver/plugin-next';
    const nextInstalled = {
      ...installed,
      id: '33333333-3333-4333-8333-333333333333',
      pluginId: nextPluginId,
    } as InstalledPluginEntity;
    const nextManifest = { ...manifest, id: nextPluginId };
    const nextUpgrade = jest.fn().mockResolvedValue(undefined);
    repo.find.mockResolvedValue([installed, nextInstalled]);
    loader.getManifest.mockImplementation((id: string) =>
      id === pluginId ? manifest : nextManifest,
    );
    loader.getModule.mockImplementation(async (id: string) => ({
      plugin: { onUpgrade: id === pluginId ? onUpgrade : nextUpgrade },
    }));
    onUpgrade.mockRejectedValue(new Error('first plugin failed'));
    jest.spyOn(Logger.prototype, 'error').mockImplementation();

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();

    expect(nextUpgrade).toHaveBeenCalledWith('1.0.0', '1.1.0', expect.any(Object));
    expect(nextInstalled.version).toBe('1.1.0');
    expect(
      service.getUpgradeLog().map(({ pluginId: id, success }) => ({
        pluginId: id,
        success,
      })),
    ).toEqual([
      { pluginId, success: false },
      { pluginId: nextPluginId, success: true },
    ]);
  });

  it('persists the version and applies a versioned migration in PostgreSQL', async () => {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    const databaseTenantId = randomUUID();
    const databaseSchema = `tenant_upgrade_${suffix}`;
    const databasePluginId = `@weaver/plugin-upgrade-${suffix}`;
    const migrationFile = '001_add_upgrade_probe.sql';
    const client = new Client({
      host: process.env.DATABASE_HOST,
      port: Number(process.env.DATABASE_PORT),
      user: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
      database: process.env.DATABASE_NAME,
    });
    await client.connect();

    try {
      await client.query(`CREATE SCHEMA "${databaseSchema}"`);
      await client.query(
        `INSERT INTO public.tenants (id, name, slug, schema_name)
         VALUES ($1, $2, $3, $4)`,
        [databaseTenantId, 'Plugin Upgrade E2E', `plugin-upgrade-${suffix}`, databaseSchema],
      );
      await client.query(
        `INSERT INTO public.installed_plugins (tenant_id, plugin_id, version)
         VALUES ($1, $2, '1.0.0')`,
        [databaseTenantId, databasePluginId],
      );
      fs.writeFileSync(
        path.join(pluginDir, migrationFile),
        `CREATE TABLE upgrade_probe (id UUID PRIMARY KEY);
         ALTER TABLE upgrade_probe ADD COLUMN upgraded_at TIMESTAMPTZ;`,
      );

      const databaseRepo: any = {
        manager: { transaction: async (callback: (manager: any) => Promise<unknown>) => {
          await client.query('BEGIN');
          try {
            const result = await callback({ getRepository: () => databaseRepo, query: (sql: string, args: unknown[]) => client.query(sql, args) });
            await client.query('COMMIT');
            return result;
          } catch (error) { await client.query('ROLLBACK'); throw error; }
        } },
        findOne: jest.fn(async ({ where }) => (await databaseRepo.find()).find((row: InstalledPluginEntity) => row.pluginId === where.pluginId)),
        find: jest.fn(async () => {
          const result = await client.query(
            `SELECT ip.id, ip.tenant_id, ip.plugin_id, ip.version,
                    ip.enabled, ip.settings, ip.installed_at, t.schema_name
             FROM public.installed_plugins ip
             JOIN public.tenants t ON t.id = ip.tenant_id
             WHERE ip.tenant_id = $1`,
            [databaseTenantId],
          );
          return result.rows.map(
            (row) =>
              ({
                id: row.id,
                tenantId: row.tenant_id,
                pluginId: row.plugin_id,
                version: row.version,
                enabled: row.enabled,
                settings: row.settings,
                installedAt: row.installed_at,
                tenant: {
                  id: row.tenant_id,
                  schemaName: row.schema_name,
                },
              }) as InstalledPluginEntity,
          );
        }),
        save: jest.fn(async (plugin: InstalledPluginEntity) => {
          await client.query(`UPDATE public.installed_plugins SET version = $1 WHERE id = $2`, [
            plugin.version,
            plugin.id,
          ]);
          return plugin;
        }),
      };
      const databaseLoader = {
        getManifest: jest.fn(() => ({
          id: databasePluginId,
          name: 'Database Upgrade Test',
          version: '1.1.0',
          entrypoints: { server: './src/server/index.ts' },
          permissions: [],
          migrations: [{ version: '1.1.0', sql: migrationFile }],
        })),
        getModule: jest.fn().mockResolvedValue({
          plugin: { onUpgrade: jest.fn().mockResolvedValue(undefined) },
        }),
        getPluginDir: jest.fn(() => pluginDir),
      };
      const databaseContextFactory = {
        create: jest.fn(async () => {
          expect(requireTenantContext()).toEqual({
            tenantId: databaseTenantId,
            schemaName: databaseSchema,
          });
          return {
            db: {
              runMigration: async (sql: string) => {
                await client.query(`SET search_path TO "${databaseSchema}", public`);
                await client.query(sql);
              },
            },
            settings: {},
            tenant: {
              id: databaseTenantId,
              slug: `plugin-upgrade-${suffix}`,
              schemaName: databaseSchema,
            },
          } as unknown as PluginContext;
        }),
      };
      const databaseService = new PluginRegistryService(
        databaseRepo as never,
        databaseLoader as never,
        databaseContextFactory as never,
      );

      await databaseService.onApplicationBootstrap();

      const stored = await client.query(
        `SELECT version FROM public.installed_plugins
         WHERE tenant_id = $1 AND plugin_id = $2`,
        [databaseTenantId, databasePluginId],
      );
      const columns = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = 'upgrade_probe'
         ORDER BY column_name`,
        [databaseSchema],
      );
      expect(stored.rows[0].version).toBe('1.1.0');
      expect(columns.rows.map(({ column_name }) => column_name)).toEqual(['id', 'upgraded_at']);
    } finally {
      await client.query(`DROP SCHEMA IF EXISTS "${databaseSchema}" CASCADE`);
      await client.query(`DELETE FROM public.tenants WHERE id = $1`, [databaseTenantId]);
      await client.end();
    }
  });
});
