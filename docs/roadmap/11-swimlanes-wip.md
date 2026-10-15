# Board Swimlanes & WIP Limits

**Status: Implemented with a display issue.** Swimlanes and soft WIP limits are implemented.

Reconciled September 23, 2026 against main [`27b14d7`](https://github.com/jakwinkler/weaver/commit/27b14d72ab8d201c4bf4fcbffd00830091dd21ce). This is the source baseline, which can differ from the checked-out application branch. Checked implementation items below mean the code exists; they do not certify a release or a fresh test pass.

User guide: [Boards and Views](https://github.com/jakwinkler/weaver/wiki/Boards-and-Views).

## Implemented

- [x] Validated, persisted board configuration for assignee/priority/epic grouping and status-column WIP limits.
- [x] Grouped board API data, collapsible swimlanes, and a Group by selector.
- [x] Column counts/limits, board settings, and warnings that allow the drop to continue.

## Differences from the original plan

- WIP limits warn; they do not enforce a hard prohibition on adding work.
- Server grouping can supply labels, but some local board/backlog assignee displays still use an ID fallback. The earlier readable-label claim was too broad.

## Remaining work and verification

- [ ] Resolve assignee identity display and verify grouped and ungrouped cards.
- [ ] Repeat cross-lane pointer/keyboard moves and boundary conditions at/over the WIP limit.

## Evidence

A local board with a WIP configuration rendered. Grouping/warning paths were source-reviewed; every drag warning was not exercised.

### Implementation

- [apps/api/src/modules/boards/boards.service.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/src/modules/boards/boards.service.ts)
- [apps/web/src/features/boards/KanbanBoard.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/features/boards/KanbanBoard.tsx)
- [apps/web/src/features/boards/BoardSettings.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/features/boards/BoardSettings.tsx)

### Existing automated coverage, not rerun for this documentation edit

- [apps/api/test/boards.e2e-spec.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/test/boards.e2e-spec.ts)

## Dependencies

- 01-drag-and-drop (DnD in swimlane context)
