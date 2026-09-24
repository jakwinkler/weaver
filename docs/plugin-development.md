# Weaver Plugin Development

Weaver plugins can add authenticated API routes, tenant lifecycle hooks, event subscribers, navigation, pages, UI slots, settings, permissions, migrations, and custom fields. The `@weaver/cli` package creates the complete starting structure and checks the contract before Weaver loads it.

## Create a plugin

From the directory that should contain the plugin, run:

```bash
npx @weaver/cli create-plugin release-notes
```

The prompts ask for:

- Display name and author
- Plugin type: `app`, `widget`, `feature`, or `integration`
- Scope: `tenant` or `project`
- Server and client entrypoints

For automation or a quick default plugin, skip the prompts:

```bash
npx @weaver/cli create-plugin release-notes --yes
```

You can also supply every choice explicitly:

```bash
npx @weaver/cli create-plugin release-notes \
  --display-name "Release Notes" \
  --author "Your Name" \
  --type app \
  --scope project \
  --server true \
  --client true
```

Names must contain lowercase letters, numbers, and single hyphens. `release-notes` becomes the plugin ID `@weaver/plugin-release-notes`.

## Generated structure

```text
release-notes/
├── README.md
├── package.json
├── tsconfig.json
├── vite.config.ts
├── weaver-plugin.json
└── src/
    ├── client/
    │   ├── index.ts
    │   ├── PluginPage.tsx
    │   └── styles.css
    └── server/
        ├── handlers.ts
        └── index.ts
```

Server-only scaffolds omit `src/client` and `vite.config.ts`. Client-only scaffolds omit `src/server` and the example route.

Install dependencies, validate the manifest, and start the client dev server:

```bash
cd release-notes
pnpm install
pnpm validate
pnpm dev
```

The dev server provides HMR and proxies `/api` and `/plugin-routes` to `http://localhost:3000`. Use another Weaver instance with:

```bash
pnpm dev -- --weaver-url http://localhost:3001
```

Build the runtime client bundle with:

```bash
pnpm build
```

This validates the manifest first, then writes the federation entry to `dist/client/remoteEntry.js`.

## Add a server route

Declare the route in `weaver-plugin.json`:

```json
{
  "routes": [
    {
      "method": "GET",
      "path": "/issues/:issueKey/summary",
      "handler": "getIssueSummary",
      "requiredPermissions": ["release-notes.view"]
    }
  ]
}
```

Export the named handler from `src/server/handlers.ts`:

```typescript
import type { PluginContext, PluginRequest, PluginResponse } from '@weaver/sdk';

export async function getIssueSummary(
  request: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const issue = await context.api.issues.get(request.params.issueKey);
  return { status: 200, body: { issue } };
}
```

The route is available beneath the plugin route prefix. A slash in a scoped ID is encoded as `~`:

```text
GET /plugin-routes/@weaver~plugin-release-notes/issues/WEB-42/summary
```

Plugin routes require the same bearer authentication as the Weaver API. `requiredPermissions` is enforced before the handler runs.

Run `pnpm validate` after changing routes. Validation reports routes that reference missing handler exports and handler exports that no route references.

## Add lifecycle behavior

Export hooks from the server entrypoint:

```typescript
import type { PluginContext } from '@weaver/sdk';

export async function onInstall(context: PluginContext): Promise<void> {
  await context.db.runMigration(`
    CREATE TABLE IF NOT EXISTS release_notes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

export async function onEnable(context: PluginContext): Promise<void> {
  context.logger.info('Release Notes enabled');
}

export async function onDisable(context: PluginContext): Promise<void> {
  context.logger.info('Release Notes disabled');
}

export async function onUninstall(context: PluginContext): Promise<void> {
  await context.db.runMigration('DROP TABLE IF EXISTS release_notes');
}
```

Install is the right place to create plugin-owned data. Disable must preserve it. Uninstall may remove it, so document that behavior for administrators.

## Add a UI slot

Export a React component from `src/client/index.ts`:

```tsx
export function ReleaseNotePanel({ issueKey }: { issueKey: string }) {
  return <aside>Release notes for {issueKey}</aside>;
}
```

Reference the exact export name in the manifest:

```json
{
  "ui": {
    "slots": [
      {
        "slot": "issue-detail-sidebar",
        "component": "ReleaseNotePanel",
        "requiredPermissions": ["release-notes.view"]
      }
    ]
  }
}
```

Current built-in slots are:

| Slot                   | Location                 | Props      |
| ---------------------- | ------------------------ | ---------- |
| `issue-detail-content` | Main issue detail column | `issueKey` |
| `issue-detail-sidebar` | Issue detail sidebar     | `issueKey` |

The client entrypoint is exposed as `./plugin` in the generated federation config. React and React DOM are shared with the host so the plugin does not load a second React runtime.

## Add a page and navigation item

Export the page component:

```typescript
export { ReleaseNotesPage } from './ReleaseNotesPage';
```

Declare both the page and its navigation entry:

```json
{
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
  }
}
```

The page component name must be exported from the file named by `entrypoints.client`.

## Handle and emit events

List subscriptions and emitted event names in the manifest:

```json
{
  "events": {
    "subscribes": ["issue.created", "issue.status_changed"],
    "emits": ["release-notes.published"]
  }
}
```

Export `onEvent` from the server entrypoint:

```typescript
import type { PluginContext } from '@weaver/sdk';

export async function onEvent(event: string, data: unknown, context: PluginContext): Promise<void> {
  context.logger.debug(`Received ${event}`);
  await context.events.emit('release-notes.published', { source: data });
}
```

Only installed and enabled plugins receive events. A subscription of `"*"` receives every tenant event. Common core events include `issue.created`, `issue.updated`, `issue.assigned`, `issue.moved`, `issue.status_changed`, `issue.deleted`, `project.created`, `project.updated`, `comment.created`, `comment.deleted`, and `time.logged`.

## Register custom fields

Register fields during install and remove plugin-owned fields during uninstall:

```typescript
export async function onInstall(context: PluginContext): Promise<void> {
  await context.api.customFields.register({
    name: 'Release channel',
    slug: 'release_channel',
    fieldType: 'select',
    entityType: 'issue',
    options: { choices: ['alpha', 'beta', 'stable'] },
    required: false,
  });
}

export async function onUninstall(context: PluginContext): Promise<void> {
  await context.api.customFields.unregisterAll();
}
```

Custom fields are tenant-scoped through the plugin context.

## Add settings

Declare settings as a schema:

```json
{
  "settings": {
    "schema": {
      "channel": {
        "type": "select",
        "description": "Default release channel",
        "options": ["alpha", "beta", "stable"],
        "default": "stable"
      },
      "publishAutomatically": {
        "type": "boolean",
        "default": false
      }
    }
  }
}
```

Read current tenant values from `context.settings`. Do not put secrets in the manifest or source. Tenant and plugin settings are masked in API responses but stored as plaintext JSONB. There is no encrypted settings vault. Use a separate secret manager for high-value credentials; do not assume masking provides encryption at rest.

## Declare permissions

`permissions` lists keys the plugin uses. `declaredPermissions` adds the labels administrators see in role management:

```json
{
  "permissions": ["release-notes.view", "release-notes.publish"],
  "declaredPermissions": [
    {
      "key": "release-notes.view",
      "label": "View release notes"
    },
    {
      "key": "release-notes.publish",
      "label": "Publish release notes",
      "description": "Create and publish project release notes"
    }
  ]
}
```

Apply the same permission keys to routes and UI contributions. Owners have the `*` permission. Other roles must have each required key set to `true`.

## Install in Weaver

Place the plugin directory under the repository's `plugins/` directory. The API discovers directories that contain `weaver-plugin.json`. Restart the API if the directory itself was added while file watching was unavailable.

List discovered plugins:

```text
GET /plugins/available
```

Install and enable the plugin for the authenticated tenant:

```text
POST /plugins/install  { "pluginId": "@weaver/plugin-release-notes" }
POST /plugins/enable   { "pluginId": "@weaver/plugin-release-notes" }
```

Verify the lifecycle logs, call one plugin route, and open each declared page or slot. A successful build alone does not prove tenant installation or runtime behavior.

## Command reference

| Command                       | Purpose                                                       |
| ----------------------------- | ------------------------------------------------------------- |
| `weaver create-plugin [name]` | Prompt for choices and scaffold a plugin                      |
| `weaver validate [directory]` | Check the manifest, files, handlers, settings, and UI exports |
| `weaver validate --json`      | Print validation results for tooling                          |
| `weaver dev [directory]`      | Start Vite with HMR and the Weaver proxy                      |
| `weaver build [directory]`    | Validate and build the client federation bundle               |

See [Plugin manifest reference](./plugin-manifest-reference.md) and [Plugin API reference](./plugin-api-reference.md) for the complete contracts.
