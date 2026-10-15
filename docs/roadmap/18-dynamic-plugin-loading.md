# Dynamic Plugin Loading

**Status: Implemented with a bundled fallback.** Module Federation handles runtime client loading, with a retained first-party fallback.

Reconciled September 23, 2026 against main [`27b14d7`](https://github.com/jakwinkler/weaver/commit/27b14d72ab8d201c4bf4fcbffd00830091dd21ce). This is the source baseline, which can differ from the checked-out application branch. Checked implementation items below mean the code exists; they do not certify a release or a fresh test pass.

User guide: [Plugin Development](https://github.com/jakwinkler/weaver/wiki/Plugin-Development).

## Implemented

- [x] Module Federation architecture and plugin client builds producing remoteEntry.js.
- [x] Asset-serving routes, manifest clientBundle URLs, and development server mapping/proxy behavior.
- [x] Remote registration, component caching, lazy loading, loading indicators, and plugin failure boundaries.
- [x] Shared React/router/query/state dependencies and migrated bundled plugin client configurations.

## Differences from the original plan

- The loading strategy is settled and implemented; it is not an open choice among federation/import maps/script tags.
- The host uses `@module-federation/enhanced/runtime`. Automatic Time still has a static fallback importer when no clientBundle URL is supplied, so the original zero-hardcoded-import claim is not yet true.
- Scaffolding lives in the CLI templates; a separate plugin-template package is not required.

## Remaining work and verification

- [ ] Remove the Automatic Time fallback only after its remote build and host behavior pass the same acceptance path.
- [ ] Verify a new external plugin, disabled-plugin requests, failed remote rendering, shared contexts, and HMR end to end.
- [ ] Keep generic page rendering failures separate from the plugin remote error boundary; see feature 19.

## Evidence

Ten bundled plugins were installed through the local API and enabled issue panels rendered. Asset tests alone do not establish browser federation acceptance for every plugin.

### Implementation

- [docs/architecture/0001-dynamic-plugin-loading.md](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/docs/architecture/0001-dynamic-plugin-loading.md)
- [apps/web/src/plugins/dynamic-loader.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/plugins/dynamic-loader.ts)
- [apps/api/src/plugins/plugin-assets.controller.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/src/plugins/plugin-assets.controller.ts)
- [plugins/vite.config.factory.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/plugins/vite.config.factory.ts)

### Existing automated coverage, not rerun for this documentation edit

- [apps/api/test/plugin-loading.e2e-spec.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/test/plugin-loading.e2e-spec.ts)
- [apps/web/src/plugins/dynamic-loader.test.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/plugins/dynamic-loader.test.tsx)
- [apps/web/src/plugins/router-federation.test.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/plugins/router-federation.test.ts)

## Dependencies

- None (but unblocks 20-plugin-cli)
