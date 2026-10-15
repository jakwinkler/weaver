# Bulk Operations UI

**Status: Implemented.** Bulk updates/deletes and multi-selection are implemented in the issue list.

Reconciled September 23, 2026 against main [`27b14d7`](https://github.com/jakwinkler/weaver/commit/27b14d72ab8d201c4bf4fcbffd00830091dd21ce). This is the source baseline, which can differ from the checked-out application branch. Checked implementation items below mean the code exists; they do not certify a release or a fresh test pass.

User guide: [Working with Issues](https://github.com/jakwinkler/weaver/wiki/Working-with-Issues).

## Implemented

- [x] Transactional bulk APIs, a 100-issue limit, per-target access checks, and update/delete permissions.
- [x] Bulk status, assignee, priority, sprint, and labels changes; workflow validation for status changes.
- [x] Row checkboxes, current-page select-all, Shift+click ranges, and x selection.
- [x] Selected-count toolbar and explicit bulk-delete confirmation.

## Differences from the original plan

- These are implemented endpoints and UI controls, not stubs.
- Bulk labels replace the supplied label set; they are not an implicit append operation.
- Related rows are deleted with issues. Database transactionality does not establish atomic rollback of external file storage effects or a recoverable deletion audit.

## Remaining work and verification

- [ ] Repeat browser selection and error recovery across pagination and restricted roles.
- [ ] Verify durable deletion evidence and file-storage cleanup/recovery if that becomes an acceptance requirement; issue activity is not a retained trash history.

## Evidence

Source and the existing bulk suite cover multi-field changes, limits, viewer rejection, missing-target rollback, and related-row deletion. No destructive bulk browser action was performed for the docs.

### Implementation

- [apps/api/src/modules/issues/issues.controller.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/src/modules/issues/issues.controller.ts)
- [apps/api/src/modules/issues/issues.service.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/src/modules/issues/issues.service.ts)
- [apps/web/src/features/issues/IssueListPage.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/features/issues/IssueListPage.tsx)
- [apps/web/src/features/issues/BulkActionBar.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/features/issues/BulkActionBar.tsx)

### Existing automated coverage, not rerun for this documentation edit

- [apps/api/test/bulk-operations.e2e-spec.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/test/bulk-operations.e2e-spec.ts)

## Dependencies

- 04-pagination (bulk ops work on paginated list)
- 06-keyboard-shortcuts (x to toggle selection with j/k navigation)
