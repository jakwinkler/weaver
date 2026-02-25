# Plugin CLI & Scaffolding

> `npx weaver-cli create-plugin my-plugin` scaffolds a complete plugin with manifest, server, client, and tests.

## Why
The #1 barrier to plugin development is "where do I start?" A CLI that scaffolds everything — with working examples — turns hours into minutes. Every major plugin platform (WordPress, Shopify, VS Code) has this.

## Current State
- No CLI tool
- Plugin development requires copying an existing plugin and modifying it
- No documentation on plugin authoring
- Plugin structure is consistent but undocumented

## Tasks

### CLI Package
- [ ] **Create packages/cli package** — New package: `@weaver/cli`. Uses commander.js for CLI commands. Entry point: `bin/weaver.js`. _Files: `packages/cli/package.json`, `packages/cli/bin/weaver.js`, `packages/cli/src/index.ts`_
- [ ] **`create-plugin` command** — Interactive prompts: plugin name, display name, type (app/widget/feature/integration), scope (tenant/project), include server? include client? Validates name format. _Files: `packages/cli/src/commands/create-plugin.ts`_
- [ ] **Plugin template files** — Templates for: weaver-plugin.json (pre-filled), src/server/index.ts (lifecycle hooks), src/server/handlers.ts (route handlers), src/client/index.ts (React components), vite.config.ts (federation), package.json, tsconfig.json, README.md. _Files: `packages/cli/templates/plugin/`_
- [ ] **Template variables** — Replace `{{pluginId}}`, `{{pluginName}}`, `{{author}}`, `{{type}}`, etc. in templates during scaffolding. _Files: `packages/cli/src/commands/create-plugin.ts`_
- [ ] **`dev` command** — `weaver dev` starts the plugin dev server with HMR. Proxies to main Weaver instance. _Files: `packages/cli/src/commands/dev.ts`_
- [ ] **`build` command** — `weaver build` compiles the plugin's client bundle (federation) and validates the manifest. _Files: `packages/cli/src/commands/build.ts`_
- [ ] **`validate` command** — `weaver validate` checks manifest against SDK interfaces. Reports missing fields, invalid types, unreferenced handlers. _Files: `packages/cli/src/commands/validate.ts`_

### Documentation
- [ ] **Plugin authoring guide** — Step-by-step guide: create plugin, add route, add UI slot, add page, handle events, use custom fields, permissions. _Files: `docs/plugin-development.md`_
- [ ] **Manifest reference** — Document every manifest field with types and examples. _Files: `docs/plugin-manifest-reference.md`_
- [ ] **Plugin API reference** — Document PluginContext, PluginRequest, PluginResponse, all core API methods. _Files: `docs/plugin-api-reference.md`_

### Tests
- [ ] **CLI: scaffold creates valid plugin** — Run create-plugin, verify all files exist, manifest parses, TypeScript compiles. _File: `packages/cli/__tests__/create-plugin.test.ts`_
- [ ] **CLI: validate catches errors** — Feed malformed manifest, verify error messages. _File: `packages/cli/__tests__/validate.test.ts`_
- [ ] **Integration: scaffolded plugin installs** — Create plugin via CLI, install in test tenant, verify lifecycle hooks fire. _File: manual testing_

## Acceptance Criteria
- `npx @weaver/cli create-plugin my-plugin` scaffolds a working plugin
- Scaffolded plugin can be installed without modification
- Interactive prompts guide configuration choices
- `weaver validate` catches manifest errors
- `weaver build` produces client bundle
- Plugin authoring docs cover all extension points

## Dependencies
- 18-dynamic-plugin-loading (for client build/federation setup)
