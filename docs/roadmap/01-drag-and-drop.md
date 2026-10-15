# Drag & Drop

**Status: Implemented with limits.** Boards, lists, and sprint containers support persistent drag operations.

Reconciled September 23, 2026 against main [`27b14d7`](https://github.com/jakwinkler/weaver/commit/27b14d72ab8d201c4bf4fcbffd00830091dd21ce). This is the source baseline, which can differ from the checked-out application branch. Checked implementation items below mean the code exists; they do not certify a release or a fresh test pass.

User guide: [Boards and Views](https://github.com/jakwinkler/weaver/wiki/Boards-and-Views).

## Implemented

- [x] Bulk reorder endpoint, manual sort order, activity records, and movement events.
- [x] Sortable board cards/columns with overlay, target feedback, optimistic updates, and error recovery.
- [x] Permission-aware list handles and keyboard sorting, disabled during an explicit column sort.
- [x] Movement among active/planned sprint containers and backlog, with completed containers kept read-only.

## Differences from the original plan

- `sortOrder` is used by the UI; the previous current-state paragraph saying otherwise was stale.
- Direct `statusId` updates do not bypass workflows. The service resolves an allowed transition and applies transition checks.
- Manual drag ordering and an explicit column sort are separate modes; persistence does not mean every sorted query displays manual order.

## Remaining work and verification

- [ ] Repeat browser acceptance for pointer and keyboard moves, empty targets, invalid transitions, and rollback.
- [ ] Verify complete datasets in board/backlog views beyond their current fetch caps; see features 04 and 10.

## Evidence

The local documentation walkthrough rendered populated boards and sprint containers. It did not exhaustively repeat the drag acceptance matrix. Existing tests cover movement, reordering, and permissions.

### Implementation

- [apps/api/src/modules/issues/issues.service.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/src/modules/issues/issues.service.ts)
- [apps/web/src/features/boards/KanbanBoard.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/features/boards/KanbanBoard.tsx)
- [apps/web/src/features/issues/dragAndDrop.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/features/issues/dragAndDrop.ts)
- [apps/web/src/features/boards/SprintBoard.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/features/boards/SprintBoard.tsx)

### Existing automated coverage, not rerun for this documentation edit

- [apps/api/test/drag-and-drop.e2e-spec.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/test/drag-and-drop.e2e-spec.ts)
- [apps/web/src/features/issues/dragAndDrop.test.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/features/issues/dragAndDrop.test.ts)

## Dependencies

- None
