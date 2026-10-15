# Plugin Upgrade Hooks

**Status: Implemented.** Newer plugin versions run ordered migrations and an upgrade hook before the stored version advances.

Reconciled September 23, 2026 against main [`27b14d7`](https://github.com/jakwinkler/weaver/commit/27b14d72ab8d201c4bf4fcbffd00830091dd21ce). This is the source baseline, which can differ from the checked-out application branch. Checked implementation items below mean the code exists; they do not certify a release or a fresh test pass.

User guide: [Plugin Development](https://github.com/jakwinkler/weaver/wiki/Plugin-Development).

## Implemented

- [x] SDK onUpgrade(fromVersion, toVersion, context), startup version detection, and explicit upgrade endpoint.
- [x] Versioned migrations in version order, constrained migration file paths, and transaction-scoped lifecycle work.
- [x] Stored version advancement after success; failure recording and continued processing of other plugins.
- [x] Upgrade event records and logs.

## Differences from the original plan

- The original missing-hook/version-comparison statements were obsolete.
- Upgrade records include an in-memory log; do not treat it as an indefinite persisted audit history.
- Migration fields `sql`/`path` identify SQL files in the current loader. They are not arbitrary inline SQL strings.
- Database rollback cannot reverse arbitrary network side effects from a plugin hook; no general downgrade workflow is implemented.

## Remaining work and verification

- [ ] Verify a representative prior-version upgrade, controlled failure, restart/retry, and restoration using actual plugin data.
- [ ] Define durable upgrade-history retention and an operator downgrade/repair procedure if required.

## Evidence

Source and existing tests cover hooks, newer-only migration ordering, persisted versions, and failure behavior. No upgrade/rollback cycle was repeated for this documentation edit.

### Implementation

- [packages/sdk/src/interfaces/plugin.interface.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/packages/sdk/src/interfaces/plugin.interface.ts)
- [apps/api/src/plugins/plugin-registry.service.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/src/plugins/plugin-registry.service.ts)
- [apps/api/src/plugins/plugin-context.factory.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/src/plugins/plugin-context.factory.ts)

### Existing automated coverage, not rerun for this documentation edit

- [apps/api/test/plugin-upgrades.e2e-spec.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/test/plugin-upgrades.e2e-spec.ts)
- [apps/api/src/plugins/plugin-registry.service.spec.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/src/plugins/plugin-registry.service.spec.ts)

## Dependencies

- None
