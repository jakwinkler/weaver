# Weaver Plugin Development Guide

This guide covers everything you need to create a Weaver plugin — from a minimal example to full-featured extensions with custom pages, API routes, and UI components.

## Overview

Weaver plugins can:

- **Add API routes** — custom REST endpoints under `/plugin-routes/<pluginId>/...`
- **Render UI slots** — inject components into existing pages (e.g. issue detail sidebar/content)
- **Register app pages** — full pages at `/apps/<slug>` with sidebar navigation
- **React to events** — subscribe to domain events (issue created, status changed, etc.)
- **Run migrations** — create plugin-specific database tables in the tenant schema
- **Declare permissions** — fine-grained access control integrated with the role system
- **Register custom fields** — add fields to issues, projects, users, or teams
- **Manage settings** — per-tenant configuration via the admin UI

## Quick Start

Create a minimal plugin in 5 minutes:

### 1. Create the directory

```
plugins/plugin-hello/
├── weaver-plugin.json
└── src/
    └── server/
        ├── index.ts
        └── handlers.ts
```

### 2. Write the manifest

```json
{
  "id": "@weaver/plugin-hello",
  "name": "Hello",
  "version": "1.0.0",
  "description": "A minimal example plugin",
  "author": "Your Name",
  "icon": "puzzle",
  "entrypoints": {
    "server": "src/server/index.ts"
  },
  "permissions": ["hello.view"],
  "declaredPermissions": [
    {
      "key": "hello.view",
      "label": "View Hello",
      "description": "Access the Hello plugin"
    }
  ],
  "routes": [
    { "method": "GET", "path": "/greeting", "handler": "getGreeting" }
  ]
}
```

### 3. Add lifecycle hooks

```typescript
// src/server/index.ts
import type { PluginContext } from '@weaver/sdk';

export async function onInstall(context: PluginContext): Promise<void> {
  context.logger.info('Hello plugin installed');
}

export async function onUninstall(context: PluginContext): Promise<void> {
  context.logger.info('Hello plugin uninstalled');
}
```

### 4. Add route handlers

```typescript
// src/server/handlers.ts
import type { PluginRequest, PluginResponse, PluginContext } from '@weaver/sdk';

export async function getGreeting(
  req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  return {
    status: 200,
    body: { message: `Hello, ${context.user?.displayName || 'World'}!` },
  };
}
```

### 5. Test it

Start the API, install the plugin via the admin UI, then:

```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:3000/api/plugin-routes/@weaver~plugin-hello/greeting
```

## Directory Structure

```
plugins/
  plugin-<name>/
    weaver-plugin.json          # Plugin manifest (required)
    src/
      server/
        index.ts                # Lifecycle hooks (onInstall, onEnable, etc.)
        handlers.ts             # Route handler functions
      client/
        index.ts                # Client-side exports (React components)
        *.tsx                   # UI components
    migrations/
      001_create_tables.sql     # Optional SQL migrations
```

Plugins live in the `plugins/` directory at the monorepo root. The API server auto-discovers any directory containing a `weaver-plugin.json` manifest. In development, file changes are watched and plugins reload automatically.

## Manifest Reference

The `weaver-plugin.json` file is the plugin's contract with Weaver. All fields:

```typescript
interface PluginManifest {
  // Required
  id: string;              // Scoped package ID, e.g. "@weaver/plugin-timer"
  name: string;            // Human-readable name
  version: string;         // Semver version
  entrypoints: {
    server?: string;       // Path to server entry (lifecycle hooks)
    client?: string;       // Path to client entry (React components)
  };
  permissions: string[];   // Permission keys this plugin requires

  // Optional
  description?: string;
  author?: string;
  icon?: string;           // lucide-react icon name (e.g. "list-checks", "timer")

  declaredPermissions?: Array<{
    key: string;           // e.g. "checklist.view"
    label: string;         // Shown in the Roles UI
    description?: string;
  }>;

  settings?: {
    schema: Record<string, {
      type: 'string' | 'number' | 'boolean' | 'select';
      required?: boolean;
      default?: unknown;
      description?: string;
      options?: string[];  // For 'select' type
    }>;
  };

  events?: {
    subscribes?: string[]; // Events this plugin listens to
    emits?: string[];      // Events this plugin emits
  };

  ui?: {
    slots?: Array<{
      slot: string;        // Slot name (e.g. "issue-detail-content")
      component: string;   // Component name in client entry
    }>;
    navigation?: Array<{
      label: string;       // Sidebar label
      icon: string;        // lucide-react icon name
      path: string;        // Must start with /apps/
      requiredPermissions?: string[];
    }>;
    pages?: Array<{
      path: string;        // Route path (e.g. "/apps/checklist")
      component: string;   // Component name for registry lookup
    }>;
  };

  routes?: Array<{
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    path: string;          // URL pattern with :params (e.g. "/issues/:issueKey/items")
    handler: string;       // Function name exported from handlers.ts
  }>;

  migrations?: string[];   // Paths to SQL migration files (relative to plugin root)
}
```

## Server Development

### PluginContext

Every handler and lifecycle hook receives a `PluginContext`:

```typescript
interface PluginContext {
  db: {
    query(sql: string, params?: unknown[]): Promise<unknown[]>;
    runMigration(sql: string): Promise<void>;
  };
  http: {
    get(url: string, options?): Promise<HttpResponse>;
    post(url: string, body?, options?): Promise<HttpResponse>;
    put(url: string, body?, options?): Promise<HttpResponse>;
    patch(url: string, body?, options?): Promise<HttpResponse>;
    delete(url: string, options?): Promise<HttpResponse>;
  };
  events: {
    emit(event: string, data: unknown): Promise<void>;
  };
  settings: Record<string, unknown>;  // Per-tenant plugin settings
  api: PluginCoreApi;                 // Access to Weaver core APIs
  logger: PluginLogger;               // Scoped logger
  tenant: { id: string; slug: string; schemaName: string };
  user?: { id: string; email: string; displayName: string };
}
```

### Core API

Access Weaver entities through `context.api`:

```typescript
// Issues
const issue = await context.api.issues.get('PROJ-42');
await context.api.issues.update('PROJ-42', { status: 'done' });
await context.api.issues.addComment('PROJ-42', 'Auto-closed by plugin');

// Projects
const projects = await context.api.projects.list();
const project = await context.api.projects.get('PROJ');

// Users
const users = await context.api.users.list();

// Custom Fields
await context.api.customFields.register({
  name: 'Repository URL',
  slug: 'repository_url',
  fieldType: 'url',
  entityType: 'project',
});
await context.api.customFields.unregisterAll(); // Clean up on uninstall
```

### Route Handlers

Route handlers receive a `PluginRequest` and must return a `PluginResponse`:

```typescript
interface PluginRequest {
  params: Record<string, string>;  // URL params (e.g. :issueKey)
  query: Record<string, string>;   // Query string params
  body: unknown;                   // Request body (parsed JSON)
  headers: Record<string, string>;
}

interface PluginResponse {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}
```

Routes are automatically mounted at `/plugin-routes/<pluginId>/...`. Scoped IDs use `~` instead of `/`:

```
@weaver/plugin-checklist → /plugin-routes/@weaver~plugin-checklist/...
```

### Lifecycle Hooks

```typescript
// src/server/index.ts
export async function onInstall(context: PluginContext): Promise<void> {
  // Run migrations, seed data
  await context.db.runMigration(CREATE_TABLE_SQL);
}

export async function onEnable(context: PluginContext): Promise<void> {
  // Plugin activated for this tenant
}

export async function onDisable(context: PluginContext): Promise<void> {
  // Plugin deactivated (data preserved)
}

export async function onUninstall(context: PluginContext): Promise<void> {
  // Clean up: drop tables, remove custom fields
  await context.db.runMigration('DROP TABLE IF EXISTS my_table CASCADE');
}
```

### Events

Subscribe to domain events in the manifest and handle them:

```json
{
  "events": {
    "subscribes": ["issue.created", "issue.status_changed"],
    "emits": ["my_plugin.action_completed"]
  }
}
```

Emit events from handlers:

```typescript
await context.events.emit('my_plugin.action_completed', { issueKey, result });
```

### Database

Plugins run SQL against the tenant's schema:

```typescript
// Query
const rows = await context.db.query(
  'SELECT * FROM my_table WHERE issue_id = $1 ORDER BY position',
  [issueId],
);

// Insert
const result = await context.db.query(
  'INSERT INTO my_table (name, value) VALUES ($1, $2) RETURNING *',
  [name, value],
);

// Migration (DDL)
await context.db.runMigration(`
  CREATE TABLE IF NOT EXISTS my_table (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`);
```

## Client Development

### UI Slots

Slots inject components into existing Weaver pages. Available slots:

| Slot Name | Location | Props Passed |
|-----------|----------|-------------|
| `issue-detail-content` | Issue detail page, main content area | `issueKey: string` |
| `issue-detail-sidebar` | Issue detail page, right sidebar | `issueKey: string` |

To add a slot component:

1. Create the React component in `plugins/<name>/src/client/`
2. Create a wrapper in `apps/web/src/plugins/components/` that wires up the API client
3. Register in `SLOT_REGISTRY` in `plugin-slot-registry.ts`

Example wrapper:

```tsx
// apps/web/src/plugins/components/MyPluginSlot.tsx
import { MyComponent } from '@weaver/plugin-my-plugin';
import { apiClient } from '@/api/client';

export function MyPluginSlot({ issueKey }: { issueKey: string }) {
  const pluginId = '@weaver~plugin-my-plugin';
  const base = `/plugin-routes/${pluginId}`;

  const api = {
    getData: async () => (await apiClient.get(`${base}/data/${issueKey}`)).data,
  };

  return <MyComponent api={api} />;
}
```

Register it:

```typescript
// In plugin-slot-registry.ts SLOT_REGISTRY array:
{
  pluginId: '@weaver/plugin-my-plugin',
  slotName: 'issue-detail-sidebar',
  component: MyPluginSlot,
  requiredPermissions: ['my_plugin.view'],
}
```

### App Pages

Plugins can register full pages accessible at `/apps/<slug>` with sidebar navigation.

1. Declare in manifest:

```json
{
  "ui": {
    "navigation": [
      {
        "label": "My App",
        "icon": "puzzle",
        "path": "/apps/my-plugin",
        "requiredPermissions": ["my_plugin.view"]
      }
    ],
    "pages": [
      { "path": "/apps/my-plugin", "component": "MyAppPage" }
    ]
  }
}
```

2. Create the page component:

```tsx
// apps/web/src/plugins/components/MyAppPage.tsx
export function MyAppPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold">My Plugin</h1>
      {/* Page content */}
    </div>
  );
}
```

3. Register in `plugin-slot-registry.ts`:

```typescript
// NAVIGATION_REGISTRY
{
  pluginId: '@weaver/plugin-my-plugin',
  label: 'My App',
  icon: 'puzzle',
  path: '/apps/my-plugin',
  requiredPermissions: ['my_plugin.view'],
}

// PAGE_REGISTRY
{
  pluginId: '@weaver/plugin-my-plugin',
  path: '/apps/my-plugin',
  component: MyAppPage,
  requiredPermissions: ['my_plugin.view'],
}
```

The sidebar will show "Apps" with your entry when the plugin is installed and enabled. The section hides automatically when no plugin apps are available.

### Plugin Icons

Register icon mappings in `apps/web/src/plugins/plugin-icons.ts`:

```typescript
import { MyIcon } from 'lucide-react';

export const PLUGIN_ICONS: Record<string, LucideIcon> = {
  // ... existing entries
  'my-icon': MyIcon,
};
```

The icon name in the manifest `icon` field and `navigation[].icon` must match a key in this map. Unrecognized icons fall back to the `Puzzle` icon.

## Registering Your Plugin

A plugin needs entries in up to 4 places in the frontend:

| Registry | File | Purpose |
|----------|------|---------|
| `SLOT_REGISTRY` | `plugin-slot-registry.ts` | UI slot components |
| `NAVIGATION_REGISTRY` | `plugin-slot-registry.ts` | Sidebar "Apps" entries |
| `PAGE_REGISTRY` | `plugin-slot-registry.ts` | Full-page components |
| `PLUGIN_ICONS` | `plugin-icons.ts` | Icon name → component mapping |

All registries are **static** — entries are added at build time, not dynamically loaded. This keeps the system type-safe and simple. Since plugins ship in the monorepo, a rebuild is already required for any code change.

## Permissions

### Declaring

In your manifest, declare both the permission keys and their human-readable descriptions:

```json
{
  "permissions": ["my_plugin.view", "my_plugin.edit"],
  "declaredPermissions": [
    {
      "key": "my_plugin.view",
      "label": "View My Plugin",
      "description": "Access the plugin's data"
    },
    {
      "key": "my_plugin.edit",
      "label": "Edit My Plugin",
      "description": "Modify plugin data"
    }
  ]
}
```

### Enforcing

- **Server-side**: Plugin routes are authenticated (JWT guard). For fine-grained checks, inspect the user's role permissions in your handler logic.
- **Client-side**: Use `requiredPermissions` in slot/navigation/page registries. The framework automatically hides UI elements the user can't access.

### How it works

- The `owner` role always has full access (`*` wildcard)
- Other roles use dot-notation permissions: `{ 'my_plugin.view': true }`
- Plugin permissions appear in the Roles admin page under a "Plugin" group
- Permissions are cleaned up automatically when a plugin is uninstalled

## Example: Checklist Plugin

The `@weaver/plugin-checklist` is a complete reference implementation:

```
plugins/plugin-checklist/
├── weaver-plugin.json              # Full manifest with all features
├── src/
│   ├── server/
│   │   ├── index.ts                # onInstall creates table, onUninstall drops it
│   │   └── handlers.ts             # CRUD + reorder + aggregated list
│   └── client/
│       ├── index.ts                # Exports ChecklistPanel + useChecklist
│       ├── ChecklistPanel.tsx      # Embeddable panel component
│       └── useChecklist.ts         # Headless hook with optimistic updates
```

**What it demonstrates:**

- SQL migration in `onInstall` / cleanup in `onUninstall`
- 6 route handlers (CRUD + reorder + aggregated list)
- UI slot (`issue-detail-content`) for per-issue checklists
- App page (`/apps/checklist`) showing all checklists across issues
- Sidebar navigation entry under "Apps"
- Event emission (`checklist.item_added`, `checklist.item_completed`, `checklist.item_removed`)
- Permission-gated UI and routes
- Plugin settings (`trackActivity`, `syncDoneRatio`)

### Frontend wiring

The checklist plugin has 3 frontend registrations:

```typescript
// SLOT_REGISTRY — embeds in issue detail
{ pluginId: '@weaver/plugin-checklist', slotName: 'issue-detail-content', component: ChecklistSlot, ... }

// NAVIGATION_REGISTRY — shows "Checklists" in sidebar
{ pluginId: '@weaver/plugin-checklist', label: 'Checklists', icon: 'list-checks', path: '/apps/checklist', ... }

// PAGE_REGISTRY — renders the full page
{ pluginId: '@weaver/plugin-checklist', path: '/apps/checklist', component: ChecklistAppPage, ... }
```

## Available UI Slots

| Slot Name | Page | Position | Props |
|-----------|------|----------|-------|
| `issue-detail-content` | Issue Detail (`/issues/:key`) | Below description, main column | `issueKey: string` |
| `issue-detail-sidebar` | Issue Detail (`/issues/:key`) | Right sidebar, below fields | `issueKey: string` |

New slots can be added by placing `<PluginSlot name="my-new-slot" />` in any page component. The slot name is the key that plugins reference in their manifest.
