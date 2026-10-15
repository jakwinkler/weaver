# Automation Rules UI

**Status: Implemented.** Admins can build, scope, enable, and inspect rules through the UI.

Reconciled September 23, 2026 against main [`27b14d7`](https://github.com/jakwinkler/weaver/commit/27b14d72ab8d201c4bf4fcbffd00830091dd21ce). This is the source baseline, which can differ from the checked-out application branch. Checked implementation items below mean the code exists; they do not certify a release or a fresh test pass.

User guide: [Automations](https://github.com/jakwinkler/weaver/wiki/Automations).

## Implemented

- [x] Admin list and embedded project-settings automation view.
- [x] Four-step trigger/conditions/actions/review builder, with global or project scope.
- [x] Trigger selection, condition rows, action configuration/reordering, and enabled toggles.
- [x] Execution history, editing/deletion, API hooks, and administration navigation.

## Differences from the original plan

- The UI and project settings integration already exist.
- The UI offers a curated set of fields; the validated backend contract can support a wider set.
- Saving a rule and seeing it in the list does not prove its downstream actions succeeded.

## Remaining work and verification

- [ ] Repeat enable/disable/delete, error display, condition combinations, and restricted-role browser checks.
- [ ] Verify execution history after partial failures and real scheduled runs.

## Evidence

The four-step local wizard created the rule used in the successful event-automation check. Toggle/delete paths were not all repeated.

### Implementation

- [apps/web/src/features/admin/AutomationsPage.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/features/admin/AutomationsPage.tsx)
- [apps/web/src/features/admin/RuleBuilder.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/features/admin/RuleBuilder.tsx)
- [apps/web/src/features/projects/ProjectSettingsPage.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/features/projects/ProjectSettingsPage.tsx)

### Existing automated coverage, not rerun for this documentation edit

- [apps/web/src/features/admin/automation-utils.test.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/features/admin/automation-utils.test.ts)
- [apps/api/test/automations.e2e-spec.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/test/automations.e2e-spec.ts)

## Dependencies

- 15-automation-engine (backend must exist)
