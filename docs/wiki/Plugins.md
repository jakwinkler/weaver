# Enable and manage plugins

Plugins add optional views, issue panels, applications, and integrations. An administrator installs a plugin for the organization; project-scoped features may also need to be enabled in the project's settings.

**Fixed page problem:** the September local walkthrough found this page blank after the example plugins were installed, because the page expected settings that the installed-plugin list leaves out. Commit [`5d20a39`](https://github.com/jakwinkler/weaver/commit/5d20a39c472c0885ba5658d59ef26e7543857ba5), merged with PR #21, handles the missing settings and adds a component test. The management screen was not rerun in a browser for this documentation update, so check it on your installation before relying on its controls.

## Understand the controls

Open **Administration → Plugins**. The page separates installed plugins from available plugins. “Available” means the server discovered a plugin package; it is not a claim that the external service behind an integration is configured.

| Action | Meaning |
| --- | --- |
| Install | Register the plugin for this organization and run its install behavior |
| Enable | Make an installed plugin active |
| Disable | Turn off an installed plugin without treating it as an uninstall |
| Settings | Configure fields declared by the plugin |
| Uninstall | Remove the installation and run its uninstall behavior, which can delete plugin-owned data |

Some plugins install disabled, including Automatic Time. Review permissions and configuration before enabling them. For project features, also inspect **Project Settings**. A tenant-level installation alone may not show a view in every project.

Board, sprint, Gantt, calendar, and issue time-log routes check both the organization's plugin state and the project's enabled feature. Opening a direct URL does not turn a disabled feature on.

## Configure settings

Use **Settings** on an installed plugin. Its manifest determines the form: text, numbers, switches, choices, or longer text fields. Read each label and description, fill required fields, and save. Invalid values should produce a field or request error.

A default value does not mean the integration has valid credentials. Plugin settings are masked in API responses but stored as plaintext JSONB, not an encrypted vault. Keep high-value credentials in a separate secret manager, and never paste credentials into documentation or screenshots.

## Upgrade a plugin

An operator supplies the new plugin package and runtime assets. The server compares its manifest version with the installed version and can run newer migrations and an upgrade hook. A failed upgrade leaves the installed version unchanged and records an error.

Back up the relevant data before an upgrade. Test the plugin's actual screen and server behavior afterward. An updated version number or an HTTP 200 for its JavaScript bundle is not enough to prove the plugin works in the browser.

There is no general downgrade workflow. Rollback needs the previous package and an appropriate data/configuration backup. Plugin hooks can have effects beyond the version record.

## Remove a plugin

Prefer **Disable** when you need a temporary pause. Read the uninstall confirmation carefully. Automatic Time, for example, declares that uninstalling deletes private drafts, correction memory, settings, and paired devices while preserving official time entries.

If a plugin fails to load, see [Troubleshooting](https://github.com/jakwinkler/weaver/wiki/Troubleshooting). If you are building one, continue with [Plugin Development](https://github.com/jakwinkler/weaver/wiki/Plugin-Development).

---

## Technical reference (developers and LLMs)

The guidance above covers everyday use. The details below explain API contracts, implementation, and operational limits.

The plugin API includes `GET /plugins/available`, `GET /plugins`, and POST actions `/plugins/install`, `/enable`, `/disable`, `/uninstall`, and `/upgrade`. Mutations require administrative plugin permission. Settings use the plugin ID and `/plugins/settings`; consult the controller for query/body shape. The general installed list omits tenant settings and secrets.

Client assets are served under `/plugin-assets/<scoped-plugin-id>/remoteEntry.js`. The host loads exposed plugin components through module federation and uses a failure boundary for remote loading. Core React, router, state, and query dependencies must be shared consistently.

Production loading checks trusted plugin IDs. Versioned migrations run in version order and stay within the plugin directory. `onUpgrade(fromVersion, toVersion, context)` runs before the installed version advances. Inspect logs and data after a failure; transaction boundaries cannot reverse arbitrary network effects from plugin code.

The September blank Plugins screen came from a contract mismatch: the page passed `plugin.settings` to `formatSettingsSummary`, which called `Object.entries` for a nonempty settings schema, while the installed-plugin list deliberately omits settings. Since [`5d20a39`](https://github.com/jakwinkler/weaver/commit/5d20a39c472c0885ba5658d59ef26e7543857ba5), `formatSettingsSummary` accepts a missing value and shows "Open Settings to view configuration.", covered by `PluginsPage.test.tsx`. Keep private settings out of the general list response.

### Source reference

Checked against source revision [`1b1b370`](https://github.com/jakwinkler/weaver/commit/1b1b3704c37b4d1ab09347508d57968e1de38130).

- [apps/web/src/features/settings/PluginsPage.tsx](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/web/src/features/settings/PluginsPage.tsx)
- [apps/web/src/features/settings/PluginSettingsForm.tsx](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/web/src/features/settings/PluginSettingsForm.tsx)
- [apps/api/src/plugins/plugins.controller.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/api/src/plugins/plugins.controller.ts)
- [apps/api/src/plugins/plugin-loader.service.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/api/src/plugins/plugin-loader.service.ts)
- [apps/api/src/plugins/plugin-registry.service.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/api/src/plugins/plugin-registry.service.ts)

Pilot update checked against [`ce5494a`](https://github.com/jakwinkler/weaver/commit/ce5494a445f0a5412cf7e0be378308afbeb5e5f8): [shared project feature gate](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/apps/web/src/features/projects/useProjectFeatureEnabled.ts), [plugin settings guidance](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/docs/plugin-development.md), and [browser coverage](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/apps/web/e2e/kanban.spec.ts).
