# Automation Engine

**Status: Implemented with an SDK integration gap.** Queued rules and built-in workflow conditions/post-functions are wired into issue transitions.

Reconciled September 23, 2026 against main [`27b14d7`](https://github.com/jakwinkler/weaver/commit/27b14d72ab8d201c4bf4fcbffd00830091dd21ce). This is the source baseline, which can differ from the checked-out application branch. Checked implementation items below mean the code exists; they do not certify a release or a fresh test pass.

User guide: [Automations](https://github.com/jakwinkler/weaver/wiki/Automations).

## Implemented

- [x] Rule and execution entities, validated trigger/condition/action schemas, and admin CRUD.
- [x] Event-driven BullMQ evaluation, AND conditions, ordered actions, disabled-rule handling, and depth-5 loop protection.
- [x] Field changes, transitions, labels, comments, in-app notifications, and webhook actions.
- [x] Workflow conditions/validators before transition and post-functions afterward; latest 100 execution records retained per rule.

## Differences from the original plan

- The engine and built-in transition behavior exist; the former unused-fields description was stale.
- `registerWorkflowConditions` and `registerWorkflowPostFunctions` remain SDK declarations without a runtime invocation found in the plugin loader/registry. Built-in registries are not proof that custom plugin callbacks run.
- Actions can partially succeed before a later action fails; this is not a transaction across arbitrary external effects.

## Remaining work and verification

- [ ] Wire and test custom plugin workflow registration callbacks if that SDK extension point remains required.
- [ ] Bound matching-issue fan-out and verify retries for visible or external effects.
- [ ] Add automation management audit coverage; see feature 28.

## Evidence

A rule created in the local UI added triage to a new issue; the successful execution record was checked. Other action types and custom plugin registration were not runtime-accepted.

### Implementation

- [apps/api/src/modules/automations/automation-engine.service.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/src/modules/automations/automation-engine.service.ts)
- [apps/api/src/modules/automations/action-executor.service.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/src/modules/automations/action-executor.service.ts)
- [apps/api/src/modules/issues/issues.service.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/src/modules/issues/issues.service.ts)
- [packages/sdk/src/interfaces/plugin.interface.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/packages/sdk/src/interfaces/plugin.interface.ts)

### Existing automated coverage, not rerun for this documentation edit

- [apps/api/test/automations.e2e-spec.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/test/automations.e2e-spec.ts)
- [apps/api/src/modules/automations/action-executor.service.spec.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/src/modules/automations/action-executor.service.spec.ts)

## Dependencies

- None (core infrastructure)
