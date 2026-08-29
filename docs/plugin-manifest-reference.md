# Weaver Plugin Manifest Reference

Every plugin has a `weaver-plugin.json` file at its root. The manifest is the discovery, security, server routing, and UI contribution contract between the plugin and Weaver.

Validate it from the plugin directory:

```bash
npx @weaver/cli validate
```

## Complete shape

```typescript
interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  icon?: string;
  type?: 'app' | 'widget' | 'feature' | 'integration';
  scope?: 'tenant' | 'project';
  entrypoints: {
    server?: string;
    client?: string;
  };
  permissions: string[];
  declaredPermissions?: PluginDeclaredPermission[];
  settings?: {
    schema: Record<string, PluginSettingDefinition>;
  };
  events?: {
    subscribes?: string[];
    emits?: string[];
  };
  ui?: {
    slots?: PluginUISlot[];
    navigation?: PluginNavigationItem[];
    pages?: PluginPageDefinition[];
    projectViews?: PluginProjectViewDefinition[];
  };
  routes?: PluginRouteDefinition[];
  migrations?: string[];
}
```

## Top-level fields

| Field                 | Type          | Required | Meaning                                                       |
| --------------------- | ------------- | -------- | ------------------------------------------------------------- |
| `id`                  | string        | Yes      | Unique lowercase package ID, normally `@weaver/plugin-<slug>` |
| `name`                | string        | Yes      | Human-readable plugin name                                    |
| `version`             | semver string | Yes      | Plugin release version, such as `1.2.0`                       |
| `description`         | string        | No       | Short administrator-facing description                        |
| `author`              | string        | No       | Author or organization                                        |
| `icon`                | string        | No       | Icon registry key, with `puzzle` as the safe default          |
| `type`                | enum          | No       | `app`, `widget`, `feature`, or `integration`                  |
| `scope`               | enum          | No       | `tenant` or `project`                                         |
| `entrypoints`         | object        | Yes      | Server and client source entrypoints                          |
| `permissions`         | string[]      | Yes      | Permission keys used by this plugin                           |
| `declaredPermissions` | object[]      | No       | Human-readable permission definitions                         |
| `settings`            | object        | No       | Tenant settings schema                                        |
| `events`              | object        | No       | Event subscriptions and declared emissions                    |
| `ui`                  | object        | No       | Client slots, navigation, pages, and project views            |
| `routes`              | object[]      | No       | Authenticated server route definitions                        |
| `migrations`          | string[]      | No       | Paths to plugin migration files                               |

## Identity and classification

### `id`

The ID must be stable after publication. It is stored with tenant installations and appears in API paths.

```json
"id": "@weaver/plugin-release-notes"
```

The plugin route URL replaces the scoped ID slash with `~`:

```text
@weaver/plugin-release-notes
@weaver~plugin-release-notes
```

### `type`

| Value         | Intended use                                        |
| ------------- | --------------------------------------------------- |
| `app`         | Full workflow or application with one or more pages |
| `widget`      | Focused content embedded in an existing page        |
| `feature`     | Adds capability across existing Weaver workflows    |
| `integration` | Connects Weaver to an external system               |

Classification is descriptive. Entrypoints and contributions determine actual behavior.

### `scope`

| Value     | Intended use                                             |
| --------- | -------------------------------------------------------- |
| `tenant`  | One configuration and behavior set for the tenant        |
| `project` | Capability is presented or configured in project context |

Plugin storage and lifecycle context remain tenant-isolated in both cases.

## `entrypoints`

```json
"entrypoints": {
  "server": "src/server/index.ts",
  "client": "src/client/index.ts"
}
```

- `server` exports lifecycle hooks and `onEvent`.
- `client` exports React components named by `ui.slots` and `ui.pages`.
- Paths are relative to the plugin root and must not leave it.
- A plugin may provide only one entrypoint.
- Routes require a server entrypoint and a sibling `handlers.ts` file.
- UI components require a client entrypoint.

## Permissions

### `permissions`

An array of every permission key the plugin uses:

```json
"permissions": ["release-notes.view", "release-notes.publish"]
```

### `declaredPermissions`

```typescript
interface PluginDeclaredPermission {
  key: string;
  label: string;
  description?: string;
}
```

Example:

```json
"declaredPermissions": [
  {
    "key": "release-notes.publish",
    "label": "Publish release notes",
    "description": "Create and publish project release notes"
  }
]
```

Use the same key in `permissions`, route requirements, and UI requirements. Keep keys namespaced to the plugin.

## Settings

```typescript
interface PluginSettingDefinition {
  type: 'string' | 'number' | 'boolean' | 'select';
  required?: boolean;
  default?: unknown;
  description?: string;
  options?: string[];
}
```

Example:

```json
"settings": {
  "schema": {
    "projectPrefix": {
      "type": "string",
      "required": true,
      "description": "Prefix added to published notes"
    },
    "maximumItems": {
      "type": "number",
      "default": 50
    },
    "publishAutomatically": {
      "type": "boolean",
      "default": false
    },
    "channel": {
      "type": "select",
      "options": ["alpha", "beta", "stable"],
      "default": "stable"
    }
  }
}
```

Rules:

- A default must match the setting type.
- A `select` must have at least one option.
- A `select` default must be one of its options.
- Settings are available as `context.settings`.
- Do not store secrets as defaults in a manifest.

## Events

```json
"events": {
  "subscribes": ["issue.created", "issue.status_changed"],
  "emits": ["release-notes.published"]
}
```

`subscribes` controls which events reach the server entrypoint's `onEvent` export. `"*"` subscribes to every tenant event. `emits` documents plugin event names for administrators and other plugin authors. Emit with `context.events.emit(name, data)`.

## UI contributions

### Slots

```typescript
interface PluginUISlot {
  slot: string;
  component: string;
  requiredPermissions?: string[];
}
```

```json
"slots": [
  {
    "slot": "issue-detail-sidebar",
    "component": "ReleaseNotePanel",
    "requiredPermissions": ["release-notes.view"]
  }
]
```

`component` must be a named export from `entrypoints.client`. Current built-in slots are `issue-detail-content` and `issue-detail-sidebar`.

### Navigation

```typescript
interface PluginNavigationItem {
  label: string;
  icon: string;
  path: string;
  requiredPermissions?: string[];
}
```

```json
"navigation": [
  {
    "label": "Release Notes",
    "icon": "file-text",
    "path": "/apps/release-notes",
    "requiredPermissions": ["release-notes.view"]
  }
]
```

Navigation does not render a page by itself. Pair it with a page at the same path.

### Pages

```typescript
interface PluginPageDefinition {
  path: string;
  component: string;
  requiredPermissions?: string[];
}
```

```json
"pages": [
  {
    "path": "/apps/release-notes",
    "component": "ReleaseNotesPage",
    "requiredPermissions": ["release-notes.view"]
  }
]
```

`component` must be exported by the client entrypoint.

### Project views

```typescript
interface PluginProjectViewDefinition {
  label: string;
  icon: string;
  viewPath: string;
  requiredPermissions?: string[];
}
```

```json
"projectViews": [
  {
    "label": "Release Notes",
    "icon": "file-text",
    "viewPath": "release-notes",
    "requiredPermissions": ["release-notes.view"]
  }
]
```

Project view paths are resolved inside the current project route.

## Routes

```typescript
interface PluginRouteDefinition {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  handler: string;
  requiredPermissions?: string[];
}
```

Example:

```json
"routes": [
  {
    "method": "POST",
    "path": "/projects/:projectKey/publish",
    "handler": "publishReleaseNotes",
    "requiredPermissions": ["release-notes.publish"]
  }
]
```

Rules:

- `path` starts with `/` and may contain named `:parameters`.
- `handler` names an exported function in `src/server/handlers.ts`, next to the server entrypoint.
- The handler receives `PluginRequest` and `PluginContext` and returns `PluginResponse`.
- Required permissions are checked before invocation.
- Routes are mounted under `/plugin-routes/<encoded-plugin-id>`.

## Migrations

```json
"migrations": ["migrations/001_create_release_notes.sql"]
```

Migration paths are relative to the plugin root. The list documents ordered migration assets. Lifecycle code may execute SQL with `context.db.runMigration`. Make migrations idempotent when they can run more than once.

## Full example

```json
{
  "id": "@weaver/plugin-release-notes",
  "name": "Release Notes",
  "version": "1.0.0",
  "description": "Create project release notes from completed issues",
  "author": "Example Team",
  "icon": "file-text",
  "type": "app",
  "scope": "project",
  "entrypoints": {
    "server": "src/server/index.ts",
    "client": "src/client/index.ts"
  },
  "permissions": ["release-notes.view", "release-notes.publish"],
  "declaredPermissions": [
    { "key": "release-notes.view", "label": "View release notes" },
    { "key": "release-notes.publish", "label": "Publish release notes" }
  ],
  "settings": {
    "schema": {
      "channel": {
        "type": "select",
        "options": ["internal", "public"],
        "default": "internal"
      }
    }
  },
  "events": {
    "subscribes": ["issue.status_changed"],
    "emits": ["release-notes.published"]
  },
  "ui": {
    "navigation": [
      {
        "label": "Release Notes",
        "icon": "file-text",
        "path": "/apps/release-notes",
        "requiredPermissions": ["release-notes.view"]
      }
    ],
    "pages": [
      {
        "path": "/apps/release-notes",
        "component": "ReleaseNotesPage",
        "requiredPermissions": ["release-notes.view"]
      }
    ]
  },
  "routes": [
    {
      "method": "POST",
      "path": "/projects/:projectKey/publish",
      "handler": "publishReleaseNotes",
      "requiredPermissions": ["release-notes.publish"]
    }
  ],
  "migrations": ["migrations/001_create_release_notes.sql"]
}
```
