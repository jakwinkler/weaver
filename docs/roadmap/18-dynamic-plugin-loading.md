# Dynamic Plugin Loading

> Eliminate hardcoded plugin imports. Plugins register themselves, client loads components at runtime.

## Why
Currently, adding a client-side plugin requires editing `dynamic-loader.ts` to add a static import. This kills community plugins — nobody can ship a plugin without modifying core code. This is THE blocker for an open plugin ecosystem.

## Current State
- `dynamic-loader.ts` has a hardcoded `pluginImporters` map with static `import()` expressions
- `plugin-slot-registry.ts` aggregates UI contributions from manifests
- Server-side: plugins are discovered by scanning `/plugins/` directory for `weaver-plugin.json`
- Client-side: no runtime discovery, only build-time imports
- Plugin manifests define entrypoints.client but this path is only used server-side

## Tasks

### Architecture Decision
- [ ] **Choose loading strategy** — Option A: Module Federation (webpack/vite-plugin-federation) — plugins built as separate bundles, loaded at runtime via remote entry. Option B: Import Maps — plugins published to CDN, browser resolves at runtime. Option C: Server-rendered manifest with bundled plugin URLs — backend serves compiled plugin JS, frontend loads via script tag. **Recommended: Option A (Module Federation)** for Vite ecosystem compatibility. _Files: architecture decision record_

### Backend
- [ ] **Plugin build pipeline** — Add build step for each plugin with client entrypoint. Output: `dist/client/remoteEntry.js` per plugin. Use vite-plugin-federation to expose components. _Files: `plugins/*/vite.config.ts`_
- [ ] **Serve plugin assets** — Static file serving for plugin client bundles at `/plugin-assets/{pluginId}/remoteEntry.js`. _Files: `apps/api/src/plugins/plugin-assets.controller.ts`_
- [ ] **Plugin manifest includes client bundle URL** — When serving available plugins, include `clientBundle` URL in response. _Files: `apps/api/src/plugins/plugin-loader.service.ts`_
- [ ] **Plugin dev server** — In development, proxy plugin module requests to individual plugin dev servers (vite HMR per plugin). _Files: `apps/api/src/plugins/plugin-assets.controller.ts`_

### Frontend
- [ ] **Replace static imports with dynamic federation** — Remove hardcoded `pluginImporters` map. Instead, use `loadRemote()` from `@module-federation/runtime` to load plugin components from their `clientBundle` URL. _Files: `apps/web/src/plugins/dynamic-loader.ts`_
- [ ] **Plugin component resolution** — `getPluginComponent(pluginId, componentName)` fetches the remote entry, resolves the named export, wraps in React.lazy(). Cache loaded modules. _Files: `apps/web/src/plugins/dynamic-loader.ts`_
- [ ] **Shared dependencies** — Configure react, react-dom, zustand, @tanstack/react-query as shared singletons in federation config. Plugins use host's copies. _Files: `apps/web/vite.config.ts`_
- [ ] **Graceful fallback** — If a plugin's client bundle fails to load (network error, 404), show error boundary with "Plugin failed to load" instead of crashing the app. _Files: `apps/web/src/plugins/PluginErrorBoundary.tsx`_
- [ ] **Plugin loading indicator** — Show skeleton/spinner while remote module loads. _Files: `apps/web/src/plugins/PluginSlot.tsx`_

### Plugin Template
- [ ] **Create plugin template** — A minimal example plugin (`plugins/plugin-template/`) with: manifest, vite.config.ts with federation, server handler, client component, README. This is what `weaver create-plugin` will scaffold. _Files: `plugins/plugin-template/`_
- [ ] **Migrate existing plugins** — Add vite.config.ts with federation to: checklist, timer, time-reports. Verify they load dynamically. _Files: `plugins/plugin-*/vite.config.ts`_

### Tests
- [ ] **E2E: plugin client bundle served** — `GET /plugin-assets/@weaver/plugin-checklist/remoteEntry.js` returns valid JS. _File: `apps/api/test/plugin-loading.e2e-spec.ts`_
- [ ] **E2E: plugin component renders** — Install plugin, navigate to its page, verify component renders (not "Plugin failed to load"). _File: manual testing_
- [ ] **Integration: shared deps not duplicated** — Verify React is loaded once, not per-plugin. Check bundle analysis. _File: build verification_
- [ ] **E2E: disabled plugin not loaded** — Disable plugin, verify client bundle not fetched. _File: `apps/api/test/plugin-loading.e2e-spec.ts`_

## Acceptance Criteria
- No hardcoded plugin imports in core codebase
- New plugins work by: create plugin dir, add manifest, build, install via API
- Plugin client bundles loaded at runtime from server
- Shared React/React Query/Zustand not duplicated
- Failed plugin loads show error boundary, not crash
- Existing plugins (checklist, timer, time-reports) work after migration
- Dev mode supports HMR for plugin development

## Dependencies
- None (but unblocks 20-plugin-cli)
