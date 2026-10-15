# Weaver Plugin Manifest Reference

Every plugin has a `weaver-plugin.json` file at its root. The manifest is the discovery, security, server routing, and UI contribution contract between the plugin and Weaver.

The API parses every manifest on startup and skips a plugin whose manifest does not match this reference. Validate it from the plugin directory first:

```bash
pnpm validate
```

The CLI is not published to npm. See [Before you start](./plugin-development.md#before-you-start).

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
  enabledByDefault?: boolean;
  uninstall?: {
    deletesPrivateData: boolean;
    confirmationMessage?: string;
  };
  entrypoints: {
    server?: string;
    client?: string;
  };
  permissions: string[];
  requires?: {
    coreCapabilities?: Array<'issue-candidates' | 'time-entries'>;
    plugins?: Array<{ id: string; minimumVersion?: string }>;
  };
  companion?: PluginCompanionMetadata;
  declaredPermissions?: PluginDeclaredPermission[];
  settings?: {
    schema?: Record<string, PluginSettingDefinition>;
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
  migrations?: Array<string | { version: string; path?: string; sql?: string }>;
}
```

Unknown fields are rejected.

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
| `enabledByDefault`    | boolean       | No       | Whether install leaves the plugin enabled. Default `true`     |
| `uninstall`           | object        | No       | Whether uninstalling deletes private data                     |
| `entrypoints`         | object        | Yes      | Server and client source entrypoints                          |
| `permissions`         | string[]      | Yes      | Permission keys used by this plugin                           |
| `requires`            | object        | No       | Core capabilities and other plugins this plugin needs         |
| `companion`           | object        | No       | Native companion app and device authentication                |
| `declaredPermissions` | object[]      | No       | Human-readable permission definitions                         |
| `settings`            | object        | No       | Tenant settings schema                                        |
| `events`              | object        | No       | Event subscriptions and declared emissions                    |
| `ui`                  | object        | No       | Client slots, navigation, pages, and project views            |
| `routes`              | object[]      | No       | Server route definitions                                      |
| `migrations`          | array         | No       | SQL migration files, plain paths or versioned objects         |

## Identity and classification

### `id`

The ID must be stable after publication. It is stored with tenant installations and appears in API paths. It uses lowercase letters, numbers, and hyphens, with an optional `@scope/` prefix.

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

### `icon`

A [Lucide](https://lucide.dev/icons/) icon name in kebab case, such as `file-text`. Unknown names fall back to `puzzle`. Navigation items and project views use the same names.

## Install and uninstall behavior

### `enabledByDefault`

```json
"enabledByDefault": false
```

Install saves the plugin as enabled unless this is `false`. Install does not call `onEnable`; enabling later through `POST /api/v1/plugins/enable` does.

### `uninstall`

```json
"uninstall": {
  "deletesPrivateData": true,
  "confirmationMessage": "Uninstalling Release Notes deletes every draft."
}
```

When `deletesPrivateData` is `true`, `POST /api/v1/plugins/uninstall` fails unless the body includes `"confirmDataDeletion": true`, and the Plugins page asks the administrator to confirm. The API returns `confirmationMessage` as the error when confirmation is missing. Uninstall runs `onUninstall`, then deletes the plugin's custom field definitions and its installation record.

## `requires`

```json
"requires": {
  "coreCapabilities": ["time-entries"],
  "plugins": [{ "id": "@weaver/plugin-time-tracking", "minimumVersion": "1.0.0" }]
}
```

- `coreCapabilities` unlocks core APIs that are closed by default. `issue-candidates` and `time-entries` are the current capabilities. Calling one without declaring it, or while the plugin is not installed and enabled, throws a forbidden error.
- `plugins` lists plugins that must already be installed for the tenant. Install and upgrade fail with a conflict when one is missing or older than `minimumVersion`.

## `companion`

```typescript
interface PluginCompanionMetadata {
  platform: 'macos' | 'windows' | 'linux';
  downloadArtifact: string;
  minimumVersion: string;
  pairingRoute: string;
  authenticator?: string;
}
```

Describes a native app that talks to the plugin. `authenticator` names a handler export that verifies device requests and returns the device principal. It is required when any route uses `"auth": "device"`. The API does not read the other fields today; they document the companion for administrators and tooling. See [Routes](#routes) for the route modes.

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
- Routes require a server entrypoint. Handlers are exported from a `handlers.ts` file next to it, or from `*.handler.ts` files in the same directory.
- With `NODE_ENV=production`, the API loads the compiled JavaScript instead: `src/server/index.ts` becomes `dist/server/index.js`. `weaver build` writes it.
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
    "label": "Board",
    "icon": "layout-dashboard",
    "viewPath": "board",
    "requiredPermissions": ["board.view"]
  }
]
```

A project view adds a tab to the project page that links to `/projects/<key>/<viewPath>`. It has no `component`, so `viewPath` must name a route the web app already has, such as `board`, `sprints`, `backlog`, `gantt`, or `calendar`. The bundled view plugins use it to switch those built-in views on. The tab appears when the plugin is enabled for the tenant and for the project.

## Routes

```typescript
interface PluginRouteDefinition {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  handler: string;
  auth?: 'interactive' | 'pairing' | 'device';
  requiredPermissions?: string[];
  requiredDeviceScopes?: string[];
  public?: boolean;
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
- `handler` names an exported function in `src/server/handlers.ts` next to the server entrypoint, or in a `*.handler.ts` file in the same directory.
- The handler receives `PluginRequest` and `PluginContext` and returns `PluginResponse`.
- Required permissions are checked before invocation.
- On protected routes, an `:issueKey` or `:projectKey` parameter is checked against the caller's project access: read for `GET`, write for other methods.

### Route modes

| `auth`                 | Mounted under                                         | Who can call it                                                                                             |
| ---------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| omitted, `interactive` | `/api/v1/plugin-routes/<encoded-plugin-id>`           | A signed-in Weaver user. With `"public": true`, anyone, so the handler must authenticate the request        |
| `pairing`              | `/api/v1/plugin-companion-routes/<encoded-plugin-id>` | Anyone who sends `x-tenant-id`. The handler must verify the pairing secret itself                           |
| `device`               | `/api/v1/plugin-companion-routes/<encoded-plugin-id>` | A device that the `companion.authenticator` handler accepts and that has every `requiredDeviceScopes` scope |

The encoded plugin ID replaces the scoped ID slash with `~`, so `@weaver/plugin-release-notes` becomes `@weaver~plugin-release-notes`. The `/api/v1` prefix follows the API's `API_PREFIX` setting.

A `public` route must include a `:tenantId` parameter holding the tenant UUID, which only locates the tenant. Webhook routes in the bundled GitHub, GitLab, and Bitbucket plugins verify the provider signature before reading or writing data. `device` routes need at least one entry in `requiredDeviceScopes`, and the manifest is rejected without one.

## Migrations

The host runs migration files itself. Paths are relative to the plugin root, must stay inside it, and must exist. Each file runs through `context.db.runMigration` in the same transaction as the install or upgrade, so a failing file rolls the operation back.

### Versioned migrations

```json
"migrations": [
  { "version": "1.0.0", "path": "migrations/001_create_release_notes.sql" },
  { "version": "1.1.0", "path": "migrations/002_add_channel.sql" }
]
```

- Install runs every versioned migration up to and including the manifest `version`, in version order.
- An upgrade runs the migrations newer than the installed version, up to the manifest version, then calls `onUpgrade(fromVersion, toVersion, context)` if the server entrypoint exports it, and records the new version. The API upgrades every installed plugin with a newer manifest version when it starts, and `POST /api/v1/plugins/upgrade` does the same for one plugin. Downgrades are rejected.
- `sql` is accepted as another name for `path`. Both hold a file path, not inline SQL.

### Plain paths

```json
"migrations": ["migrations/001_create_release_notes.sql"]
```

Plain paths run in order on install, but only when the server entrypoint does not export `onInstall`. A plugin with `onInstall` must run them itself. Upgrades ignore plain paths.

Make migrations idempotent when they can run more than once.

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
  "migrations": [{ "version": "1.0.0", "path": "migrations/001_create_release_notes.sql" }]
}
```
