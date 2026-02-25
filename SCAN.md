# Architecture Scan — Plugin System Issues & Fixes

## Issue 1: Plugin Routes Had No Permission Checks

**Problem:** Any authenticated user could call any plugin API endpoint regardless of their role permissions. The `PluginRouteController` only checked if the plugin was installed and enabled, but never verified the user had the required permissions for the specific route.

**Fix:**
- Added `requiredPermissions?: string[]` to `PluginRouteDefinition` in `packages/sdk/src/interfaces/plugin-manifest.interface.ts`
- Added permission enforcement in `apps/api/src/plugins/plugin-route.controller.ts`:
  - After route matching, checks `matchedRoute.requiredPermissions`
  - Owner role bypasses all checks
  - Loads `RoleEntity` from tenant DB, checks `permissions['*']` (superadmin) or individual perms
  - Returns 403 with list of missing permissions if check fails
- Added `requiredPermissions` to all routes in:
  - `plugins/plugin-checklist/weaver-plugin.json` — per-route: `checklist.view`, `checklist.add`, `checklist.edit`, `checklist.remove`
  - `plugins/plugin-time-reports/weaver-plugin.json` — per-route: `time-reports.view`, `time-reports.manage`, `time-reports.export`

## Issue 2: Frontend Plugin Registry Was Static

**Problem:** Adding a new plugin to the frontend required modifying 4+ files: creating a wrapper component, adding entries to `SLOT_REGISTRY`, `NAVIGATION_REGISTRY`, `PAGE_REGISTRY`, adding icon mapping to `PLUGIN_ICONS`, and rebuilding. This made the plugin system effectively hardcoded.

**Fix — Dynamic manifest-driven registry:**
- **`apps/web/src/plugins/plugin-slot-registry.ts`** — rewritten. All static arrays removed. Functions now derive entries from `PluginManifest[]` + `enabledPluginIds[]`:
  - `getSlotEntries(slotName, manifests, enabledPluginIds)`
  - `getNavigationEntries(manifests, enabledPluginIds)`
  - `getPageEntry(path, manifests, enabledPluginIds)`
  - `getProjectViewEntries(manifests, enabledPluginIds)`
- **`apps/web/src/plugins/plugin-icons.ts`** — rewritten. `getPluginIcon(name)` dynamically looks up icons from lucide-react's `icons` object using kebab-to-PascalCase conversion. No static map needed.
- **`apps/web/src/plugins/dynamic-loader.ts`** — new. `getPluginComponent(pluginId, componentName)` returns a cached `React.lazy()` component. Uses `pluginImporters` map (one line per plugin).
- **`apps/web/src/plugins/plugin-context.ts`** — new. `createPluginContext(pluginId)` builds a `PluginComponentContext` with:
  - `api` — scoped to plugin routes (`/plugin-routes/{encodedId}/{path}`)
  - `coreApi` — calls the main API directly
  - `currentUserId` — from auth store
- **Plugin wrapper components** — each plugin now exports self-contained wrappers:
  - `ChecklistSlotWrapper` / `ChecklistAppPageWrapper` in `plugins/plugin-checklist/src/client/`
  - `TimerWidgetWrapper` in `plugins/plugin-timer/src/client/`
  - `TimeReportsPageWrapper` in `plugins/plugin-time-reports/src/client/`
- **Consumers updated**: `PluginPage.tsx`, `PluginSlot.tsx`, `AppLayout.tsx`, `ProjectDetailPage.tsx`, `PluginsPage.tsx`, `ProjectSettingsPage.tsx`
- **Deleted**: `apps/web/src/plugins/components/` directory (4 old static wrapper components)

### Adding a new plugin now requires:
1. Add workspace dep to `apps/web/package.json`
2. Add one line to `pluginImporters` in `apps/web/src/plugins/dynamic-loader.ts`
3. Everything else (nav, pages, slots, icons, permissions) comes from the manifest automatically
