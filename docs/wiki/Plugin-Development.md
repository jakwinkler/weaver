# Build a Weaver plugin

Use the repository's plugin CLI to create a starting package, validate its manifest, and build its client bundle and server code. Begin with one small feature and test it in a disposable organization before installing it in a shared environment.

`@weaver/cli` and `@weaver/sdk` are not published to npm, and nothing from this repository is published under the `@weaver` npm scope. Run the CLI from a Weaver checkout and create plugins in its `plugins/` directory, where pnpm links both packages from the workspace.

## Create a starting plugin

From a current Weaver checkout with dependencies installed, build once so the CLI and the SDK helpers that generated plugins import exist in `dist/`:

```sh
pnpm build
node packages/cli/bin/weaver.js create-plugin release-notes --yes --directory plugins
node packages/cli/bin/weaver.js validate plugins/release-notes
```

The scaffold includes `weaver-plugin.json`, a package manifest, TypeScript configuration, and server/client examples according to the selected options. The name `release-notes` produces the ID `@weaver/plugin-release-notes`.

Without `--yes`, the CLI asks for display name, author, plugin type, scope, and server/client entrypoints. Choose `app`, `widget`, `feature`, or `integration`, and `tenant` or `project` scope based on how the feature should appear.

## Develop and build

Install workspace dependencies after adding the package. Inspect the generated README and scripts before starting it. The CLI provides:

| Command | Purpose |
| --- | --- |
| `create-plugin` | Generate the starting files |
| `validate` | Check manifest shape, references, and exports |
| `dev` | Run the client Vite server with HMR and an API proxy |
| `build` | Validate, build the federated client bundle, and compile server code |

`dev` requires a client/Vite configuration. `build` builds what the manifest's entrypoints declare: the client bundle for `entrypoints.client`, and JavaScript in `dist/server` for `entrypoints.server`, which is what the API loads when `NODE_ENV` is `production`. A server-only plugin skips the client step.

Build the client before testing the normal asset-serving path. The expected output is `dist/client/remoteEntry.js`. During client development, point the host at the plugin dev server using the supported development mapping, then verify the host actually requests that URL.

## Add one complete feature

Declare a route in the manifest, export its named handler, and declare the permission it requires. Add a small client page or slot that calls that route. Install and enable the plugin in the test organization, grant the intended role access, and verify both an allowed user and a user without permission.

For stored data, use the tenant-aware plugin context and migrations. For official Weaver records, use the core API capabilities supplied by the context. Keep sensitive settings out of client bundles and public manifest responses. Plugin settings are masked in API responses but stored as plaintext JSONB; use a separate secret manager for high-value credentials.

## Read the detailed contracts

The repository already maintains longer references for [developers](https://github.com/jakwinkler/weaver/wiki/Developer-Reference). Use these together with the source:

- [Authoring guide](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/docs/plugin-development.md)
- [Manifest reference](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/docs/plugin-manifest-reference.md)
- [Plugin API reference](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/docs/plugin-api-reference.md)

Those files include historical examples. Use the repository-local CLI above when an example assumes an npm package has been published.

---

## Technical reference (developers and LLMs)

The guidance above covers everyday use. The details below explain API contracts, implementation, and operational limits.

A client remote exposes `./plugin`. The host and remotes must share React, React DOM, React Router, Zustand, and React Query appropriately; duplicated router/context dependencies can pass build checks while failing in the browser.

Plugin server routes use the prefix `/api/v1/plugin-routes/<encoded-plugin-id>/...`; the router represents the slash in a scoped ID with `~`, such as `@weaver~plugin-release-notes`. Asset routes and API route encoding are different, so do not substitute one path scheme for the other.

Manifest validation checks identity, entrypoints, settings, permissions, routes, handlers, components, and referenced migrations. A valid manifest is necessary but does not prove authorization, tenant isolation, upgrade safety, or usable UI.

For upgrades, test installation at the prior version, apply the new package, confirm only newer migrations run, check the upgrade hook, and repeat with a controlled failure. Inspect whether installed-version and data state remain consistent. Declare destructive uninstall behavior so the host can require the appropriate confirmation.

The local CLI scaffold/validation check for this documentation does not constitute full acceptance of a new plugin or external package publication.

### Manifest and lifecycle contract

`weaver-plugin.json` is the package's contract with the host. The SDK interfaces below are the current reference for exact types.

| Field | What to declare |
| --- | --- |
| `id`, `name`, `version` | Stable plugin identity, display name, and package version |
| `type`, `scope` | `app`, `widget`, `feature`, or `integration`; `tenant` or `project` scope |
| `entrypoints` | Server/client paths present in the package |
| `enabledByDefault` | Whether installation should activate the feature immediately |
| `permissions`, `declaredPermissions` | Required and plugin-defined permissions with human-readable labels |
| `requires` | Required core capabilities and plugins, optionally with minimum versions |
| `settings.schema` | Named settings with type (`string`, `number`, `boolean`, or `select`), description, default, required flag, and select options. The API rejects other keys, including `label` |
| `events` | Subscribed and emitted domain event names. `WEAVER_EVENTS` in `@weaver/sdk` lists the core events; subscribe to `comment.created`, not the retired `comment.added` |
| `ui` | Named slots, navigation items, pages, and project views with relevant permissions |
| `routes` | HTTP method, path, named handler, authentication mode, and required permissions/scopes |
| `migrations` | Legacy SQL paths or versioned objects with `version` and `sql` or `path` |
| `uninstall` | Whether private data is deleted and the confirmation message to show |
| `companion` | Platform, artifact, minimum version, pairing route, and optional authenticator |

The API supplies `clientBundle` at runtime. It is the resolved remote URL, not proof that the browser can execute the remote.

Lifecycle hooks receive a tenant-scoped `PluginContext`: `onInstall`, `onEnable`, `onDisable`, `onUninstall`, and `onUpgrade(fromVersion, toVersion, context)`. Events use `onEvent(event, data, context)`. Optional registrations extend routes and workflow conditions/post-functions.

### Context and authorization

`PluginContext` supplies `db`, `http`, `events`, `settings`, `api`, `logger`, `tenant`, and `webhooks`. `user` is optional; a background lifecycle/event invocation is not automatically a user-authorized interactive request. Use parameterized database queries and never choose a tenant schema from an untrusted request field. Plugins run as trusted server code with a shared database principal: the tenant search path is a default, not an isolation boundary for fully qualified SQL. Use `context.api.projects.accessibleIds()` and `context.api.issues.assertAccess(key, mode)` for the current user's project access. Call `context.webhooks.processOnce()` only after verifying a provider's signature and payload.

Core APIs cover issues, projects, users, custom fields, activity logs, and time entries. Declared core capabilities currently include `issue-candidates`, `issue-create`, and `time-entries`. Official time APIs include batch creation, update/delete, listing, source counts, and lock-state checks. Respect ownership, idempotency references, and locked entries.

Route authentication can be `interactive`, `pairing`, or `device`. Device scopes do not replace interactive user permissions. A `public` route needs its own intended verification, such as an authenticated webhook signature; it is not permission to accept arbitrary writes. Use the exact raw request body when the provider's signature contract requires it.

### Source reference

Checked against source revision [`1b1b370`](https://github.com/jakwinkler/weaver/commit/1b1b3704c37b4d1ab09347508d57968e1de38130).

- [packages/cli/src/commands/create-plugin.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/packages/cli/src/commands/create-plugin.ts)
- [packages/cli/src/commands/validate.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/packages/cli/src/commands/validate.ts)
- [packages/cli/src/commands/dev.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/packages/cli/src/commands/dev.ts)
- [packages/cli/src/commands/build.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/packages/cli/src/commands/build.ts)
- [plugins/vite.config.factory.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/plugins/vite.config.factory.ts)
- [apps/api/src/plugins/plugin-registry.service.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/api/src/plugins/plugin-registry.service.ts)
- [packages/sdk/src/interfaces/plugin-manifest.interface.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/packages/sdk/src/interfaces/plugin-manifest.interface.ts)
- [packages/sdk/src/interfaces/plugin.interface.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/packages/sdk/src/interfaces/plugin.interface.ts)
- [packages/sdk/src/interfaces/plugin-context.interface.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/packages/sdk/src/interfaces/plugin-context.interface.ts)

Pilot update checked against [`ce5494a`](https://github.com/jakwinkler/weaver/commit/ce5494a445f0a5412cf7e0be378308afbeb5e5f8): [plugin API reference](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/docs/plugin-api-reference.md), [plugin development guide](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/docs/plugin-development.md), [context interface](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/packages/sdk/src/interfaces/plugin-context.interface.ts).
