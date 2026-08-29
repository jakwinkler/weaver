# Plugin Upgrade Hooks

> Support plugin version upgrades with migration hooks: `onUpgrade(fromVersion, toVersion, context)`.

## Why

Plugins evolve. When a plugin adds a new database column or changes its data format, it needs a migration path. Without upgrade hooks, plugin updates are destructive (uninstall + reinstall = data loss).

## Current State

- InstalledPluginEntity stores `version` field
- No version comparison on load
- No `onUpgrade` hook in WeaverPlugin interface
- Migrations array in manifest exists but only runs on install

## Tasks

### Backend

- [x] **Add onUpgrade hook to WeaverPlugin interface** — `onUpgrade?(fromVersion: string, toVersion: string, context: PluginContext): Promise<void>`. _Files: `packages/sdk/src/interfaces/index.ts`_
- [x] **Version detection on app startup** — When loading installed plugins, compare InstalledPluginEntity.version with manifest.version. If manifest is newer, trigger upgrade. _Files: `apps/api/src/plugins/plugin-registry.service.ts`_
- [x] **Run upgrade hook** — Call `onUpgrade(oldVersion, newVersion, context)`. If successful, update version in DB. If fails, log error but don't block app. _Files: `apps/api/src/plugins/plugin-registry.service.ts`_
- [x] **Sequential migration support** — Support `migrations` array in manifest with version tags: `{ version: '1.1.0', sql: './migrations/002_add_column.sql' }`. Run only migrations newer than installed version. _Files: `apps/api/src/plugins/plugin-registry.service.ts`_
- [x] **Upgrade log** — Record upgrade events: `{ pluginId, fromVersion, toVersion, success, error, timestamp }`. _Files: `apps/api/src/plugins/plugin-registry.service.ts`_

### Tests

- [x] **E2E: upgrade triggers hook** — Install plugin v1.0.0, update manifest to v1.1.0, restart, verify onUpgrade called. _File: `apps/api/test/plugin-upgrades.e2e-spec.ts`_
- [x] **E2E: version updated in DB** — After upgrade, verify InstalledPluginEntity.version matches new version. _File: `apps/api/test/plugin-upgrades.e2e-spec.ts`_
- [x] **E2E: migration runs** — Plugin with versioned migration, upgrade, verify new table/column exists. _File: `apps/api/test/plugin-upgrades.e2e-spec.ts`_
- [x] **E2E: failed upgrade handled** — onUpgrade throws, verify version NOT updated, error logged. _File: `apps/api/test/plugin-upgrades.e2e-spec.ts`_

## Acceptance Criteria

- Plugins can define onUpgrade lifecycle hook
- Version bump detected automatically on app startup
- Versioned SQL migrations run in order
- Successful upgrade updates stored version
- Failed upgrade does not update version (retry on next restart)
- Upgrade log records history

## Dependencies

- None
