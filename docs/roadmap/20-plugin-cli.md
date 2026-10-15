# Plugin CLI & Scaffolding

**Status: Implemented; package distribution unverified.** The repository CLI scaffolds, validates, serves, and builds client plugins.

Reconciled September 23, 2026 against main [`27b14d7`](https://github.com/jakwinkler/weaver/commit/27b14d72ab8d201c4bf4fcbffd00830091dd21ce). This is the source baseline, which can differ from the checked-out application branch. Checked implementation items below mean the code exists; they do not certify a release or a fresh test pass.

User guide: [Plugin Development](https://github.com/jakwinkler/weaver/wiki/Plugin-Development).

## Implemented

- [x] The @weaver/cli package and create-plugin, validate, dev, and build commands.
- [x] Interactive/noninteractive template generation for identity, scope, server/client examples, and federation configuration.
- [x] Manifest/reference validation, Vite development proxy/HMR, and client-bundle build command.
- [x] Authoring, manifest, and PluginContext reference documents.

## Differences from the original plan

- Use the repository-local entrypoint: `node packages/cli/bin/weaver.js create-plugin my-plugin --yes --directory plugins` after building the CLI.
- The earlier npx examples assume registry publication that was not verified. CLI existence does not prove an external npm release.
- Client build/dev commands require client/Vite configuration; server-only packaging needs its own verification. The template does not currently generate a plugin test suite, despite the original scaffold description mentioning tests.
- Older reference documents do not fully describe all newer companion/capability/upgrade fields; use the SDK interfaces and current wiki reference.

## Remaining work and verification

- [ ] Run install/build/render/lifecycle acceptance on a newly scaffolded plugin in a disposable tenant. Add generated test examples if that original scaffold requirement remains desired.
- [ ] Update older references for current SDK additions and verify any public package release separately.

## Evidence

The local repository CLI created a disposable documentation-example scaffold and validation passed during the preceding walkthrough. Full scaffold installation and npm publication were not tested.

### Implementation

- [packages/cli/src/commands/create-plugin.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/packages/cli/src/commands/create-plugin.ts)
- [packages/cli/src/commands/validate.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/packages/cli/src/commands/validate.ts)
- [packages/cli/src/commands/dev.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/packages/cli/src/commands/dev.ts)
- [packages/cli/src/commands/build.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/packages/cli/src/commands/build.ts)

### Existing automated coverage, not rerun for this documentation edit

- [packages/cli/__tests__/create-plugin.test.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/packages/cli/__tests__/create-plugin.test.ts)
- [packages/cli/__tests__/validate.test.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/packages/cli/__tests__/validate.test.ts)

## Dependencies

- 18-dynamic-plugin-loading (for client build/federation setup)
