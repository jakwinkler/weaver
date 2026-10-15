# Weaver Plugin Development

Weaver plugins can add authenticated API routes, tenant lifecycle hooks, event subscribers, navigation, pages, UI slots, settings, permissions, migrations, and custom fields. The `weaver` CLI in `packages/cli` creates the complete starting structure and checks the contract before Weaver loads it.

## Before you start

The CLI (`@weaver/cli`) and the SDK (`@weaver/sdk`) are not published to npm. Run the CLI from a Weaver checkout and create plugins in its `plugins/` directory, where pnpm links both packages from the workspace. Do not run `npx @weaver/cli`. It fails today with a 404, and because nothing from this repository is published under the `@weaver` npm scope, a package that appears under that name later would not come from Weaver.

From the repository root, install and build once. The CLI runs from `packages/cli/dist`, and generated plugins import compiled SDK helpers:

```bash
pnpm install --frozen-lockfile
pnpm build
```

## Create a plugin

From the repository root, run:

```bash
node packages/cli/bin/weaver.js create-plugin release-notes --directory plugins
```

The prompts ask for:

- Display name and author
- Plugin type: `app`, `widget`, `feature`, or `integration`
- Scope: `tenant` or `project`
- Server and client entrypoints

For automation or a quick default plugin, skip the prompts:

```bash
node packages/cli/bin/weaver.js create-plugin release-notes --directory plugins --yes
```

You can also supply every choice explicitly:

```bash
node packages/cli/bin/weaver.js create-plugin release-notes \
  --directory plugins \
  --display-name "Release Notes" \
  --author "Your Name" \
  --type app \
  --scope project \
  --server true \
  --client true
```

Names must contain lowercase letters, numbers, and single hyphens. `release-notes` becomes the plugin ID `@weaver/plugin-release-notes`. Without `--directory`, the plugin is created in the current directory, and the CLI prints a warning when that is not the checkout's `plugins/` directory, because pnpm cannot install it there and the API does not look there.

## Generated structure

```text
plugins/release-notes/
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

Server-only scaffolds omit `src/client` and `vite.config.ts`, and have no client bundle to build or serve. Client-only scaffolds omit `src/server` and the example route.

`package.json` depends on `@weaver/cli` and `@weaver/sdk` as `workspace:*`. `vite.config.ts` names the Module Federation remote with `getPluginRemoteName` from the SDK, which is the name the web app registers when it loads the plugin.

## Install, validate, and build

```bash
cd plugins/release-notes
pnpm install
pnpm validate
pnpm build
```

`pnpm validate` prints `Manifest is valid: <path>` or a list of errors and warnings. `pnpm build` validates again, then writes the federation entry to `dist/client/remoteEntry.js`. Run `pnpm typecheck` to check the TypeScript as well.

## Install in Weaver

Start Weaver from the repository root with `pnpm dev`. The API discovers every directory in `plugins/` that contains `weaver-plugin.json`. In development it also watches `plugins/` and reloads when a manifest or server file changes, so a running API picks up a new plugin without a restart. The log then shows `Loaded plugin manifest: @weaver/plugin-release-notes v1.0.0`.

Install the plugin for your tenant from Administration, then Plugins (`/settings/plugins`), or through the API with an access token for the tenant owner or a role with the `admin.manage_plugins` permission. `POST /api/v1/auth/login` returns one as `accessToken`:

```text
GET  /api/v1/plugins/available
POST /api/v1/plugins/install  { "pluginId": "@weaver/plugin-release-notes" }
```

Installing runs the plugin's migrations and `onInstall`, then saves the plugin as enabled unless the manifest sets `"enabledByDefault": false`. Install does not call `onEnable`. That hook runs when you call `POST /api/v1/plugins/enable` with the same body, which is also how you enable a plugin that installed disabled.

Then check the result:

- Open `/apps/release-notes` in the web app. The generated page shows the plugin name.
- Call the example route: `GET /api/v1/plugin-routes/@weaver~plugin-release-notes/hello`.
- Look for `Release Notes installed` in the API log.

A successful build alone does not prove tenant installation or runtime behavior.

## Develop with hot reload

The installed plugin loads `dist/client` until you point the API at a dev server. Start the plugin's Vite server on a fixed port:

```bash
cd plugins/release-notes
pnpm dev --port 5199
```

Pass options to `pnpm dev` directly. With `pnpm dev -- --port 5199`, pnpm forwards the `--` and the CLI reads `--port` as the plugin directory. With `--port`, Vite exits if the port is busy instead of picking another one.

Add the dev server to the API environment, for example in the repository `.env`, and restart the API:

```text
WEAVER_PLUGIN_DEV_SERVERS={"@weaver/plugin-release-notes":"http://localhost:5199"}
```

The API then redirects the plugin bundle to the dev server, and edits to client components update the open page through Module Federation HMR. Bundled plugins use ports 5181 through 5189. The setting is ignored when `NODE_ENV` is `production`.

The plugin page runs inside the web app, so its API calls use the web app's proxy. The dev server's own proxy sends `/api` to `http://localhost:3000`, or to `--weaver-url <url>`, and only applies to requests made to the dev server directly.

## Production

`pnpm build` compiles only the client bundle. With `NODE_ENV=production`, the API loads only plugins listed in `WEAVER_TRUSTED_PLUGINS`, and it loads server code from `dist/server` as JavaScript instead of `src/server`. Generated plugins do not compile their server code yet. The bundled plugins do it with `tsc -p tsconfig.server.json`; see `plugins/plugin-template` for that configuration.

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

The route is mounted under `/api/v1/plugin-routes/<plugin-id>`. A slash in a scoped ID is encoded as `~`:

```text
GET /api/v1/plugin-routes/@weaver~plugin-release-notes/issues/WEB-42/summary
```

Protected plugin routes require the same authentication as the Weaver API. Routes declared `public: true` must authenticate their provider request before accessing protected data or performing writes; a tenant UUID is only a locator. Plugins are trusted in-process code, not isolated extensions. `requiredPermissions` is enforced before the handler runs.

For a protected route, Weaver also checks the caller's project access when the path has an `:issueKey` or `:projectKey` parameter: read access for `GET`, write access for other methods.

Run `pnpm validate` after changing routes. Validation reports routes that reference missing handler exports and handler exports that no route references.

### Call a route from the client

Pages and slot components receive a `pluginContext` prop. `pluginContext.api` calls the plugin's own routes with the viewer's session, and `pluginContext.coreApi` calls core paths under `/api/v1`:

```tsx
import { useEffect, useState } from 'react';

interface PluginPageProps {
  pluginContext: {
    api: { get<T>(path: string): Promise<T> };
  };
}

export function PluginPage({ pluginContext }: PluginPageProps) {
  const [message, setMessage] = useState('Loading...');

  useEffect(() => {
    pluginContext.api
      .get<{ message: string }>('/hello')
      .then((body) => setMessage(body.message))
      .catch(() => setMessage('The hello route failed'));
  }, [pluginContext]);

  return <p>{message}</p>;
}
```

`api` also has `post`, `put`, `patch`, and `delete`. The context includes `pluginId`, `pluginRouteId`, and `currentUserId`.

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

## Command reference

Generated plugins run the CLI through their package scripts: `pnpm validate`, `pnpm dev`, and `pnpm build`. From the repository root, run `node packages/cli/bin/weaver.js <command>`.

| Command                                  | Purpose                                                       |
| ---------------------------------------- | ------------------------------------------------------------- |
| `weaver create-plugin [name]`            | Prompt for choices and scaffold a plugin                      |
| `weaver create-plugin [name] -d plugins` | Scaffold into the checkout's `plugins/` directory             |
| `weaver validate [directory]`            | Check the manifest, files, handlers, settings, and UI exports |
| `weaver validate --json`                 | Print validation results for tooling                          |
| `weaver dev [directory] --port <port>`   | Start Vite with HMR on a fixed port                           |
| `weaver dev --weaver-url <url>`          | Proxy dev server `/api` requests to another Weaver API        |
| `weaver build [directory]`               | Validate and build the client federation bundle               |

See [Plugin manifest reference](./plugin-manifest-reference.md) and [Plugin API reference](./plugin-api-reference.md) for the complete contracts.
