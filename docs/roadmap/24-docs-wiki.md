# Docs & Wiki

**Status: Implemented.** Project wiki pages, hierarchy, editing, search, history, and restore are available.

Reconciled September 23, 2026 against main [`27b14d7`](https://github.com/jakwinkler/weaver/commit/27b14d72ab8d201c4bf4fcbffd00830091dd21ce). This is the source baseline, which can differ from the checked-out application branch. Checked implementation items below mean the code exists; they do not certify a release or a fresh test pass.

User guide: [Project Wiki](https://github.com/jakwinkler/weaver/wiki/Project-Wiki).

## Implemented

- [x] Page/version entities and permission-checked CRUD, tree, search, history, and restore endpoints.
- [x] Full-text title/body search; child reassignment on deletion and hierarchy validation.
- [x] Wiki navigation, collapsible/reorderable page tree, breadcrumbs, rich viewing/editing, debounced autosave, and manual save.
- [x] History preview and restore controls with author/time information.

## Differences from the original plan

- Pages/entities/routes/navigation exist; the old missing-feature section was stale.
- History compares selected/current rendered content and supports restore. It does not provide a change-highlighted text diff.
- The project wiki is distinct from Weaver's published GitHub product documentation.

## Remaining work and verification

- [ ] Repeat browser autosave/failure recovery, reparent/reorder, restore, and restricted-role acceptance.
- [ ] Verify concurrent edits and version restoration before relying on history as conflict resolution.

## Evidence

Local parent/child pages, a saved edit, and version history rendered. The walkthrough did not perform destructive deletion or restore.

### Implementation

- [apps/api/src/modules/pages/pages.service.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/src/modules/pages/pages.service.ts)
- [apps/api/src/modules/pages/pages.controller.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/src/modules/pages/pages.controller.ts)
- [apps/web/src/features/wiki/WikiPage.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/features/wiki/WikiPage.tsx)
- [apps/web/src/features/wiki/VersionHistory.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/features/wiki/VersionHistory.tsx)

### Existing automated coverage, not rerun for this documentation edit

- [apps/api/test/wiki.e2e-spec.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/test/wiki.e2e-spec.ts)
- [apps/web/src/features/wiki/PageEditor.test.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/features/wiki/PageEditor.test.tsx)

## Dependencies

- 02-rich-text (TipTap rendering and editing)
