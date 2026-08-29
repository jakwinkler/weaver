# Drag & Drop

> Drag issues between board columns, reorder in lists, and plan sprints by dragging into sprint containers.

## Why

Without drag & drop, the Kanban board is just a read-only visualization. Every competing tool (Trello, Jira, Linear, ClickUp) makes drag & drop the primary interaction for boards and planning.

## Current State

- KanbanBoard renders columns by workflow status with issue cards
- SprintBoard lists sprints with issues
- Issues have a `sortOrder` integer field (unused in UI)
- `PATCH /issues/:key` can update `statusId` and `sprintId`
- `POST /sprints/:id/issues` can add issues to sprints

## Tasks

### Backend

- [x] **Add PATCH /issues/reorder endpoint** — Accepts `{ issues: [{ id, sortOrder }] }` for bulk reorder. Route placed before `/issues/:issueKey` to avoid param conflict. _Files: `apps/api/src/modules/issues/issues.controller.ts`, `apps/api/src/modules/issues/issues.service.ts`_
- [x] **Add statusId/sprintId to updateIssueSchema** — Added `statusId` (uuid) and `sprintId` (uuid, nullable) to `updateIssueSchema` + `reorderIssuesSchema` in shared schemas. _Files: `packages/shared/src/schemas/index.ts`_
- [x] **Handle statusId/sprintId in IssuesService.update()** — Direct status and sprint assignment without requiring workflow transitions. _Files: `apps/api/src/modules/issues/issues.service.ts`_
- [x] **Emit `issue.moved` event** — Fires `{ issueKey, projectKey, fromStatus, toStatus, fromSprint, toSprint }` on status/sprint change. _Files: `apps/api/src/modules/issues/issues.service.ts`_
- [x] **Activity log for all field changes** — Tracks assignee, status, sprint, priority, startDate, dueDate, summary, percentDone changes in activity log. _Files: `apps/api/src/modules/issues/issues.service.ts`_

### Frontend

- [x] **Install dnd-kit** — Added `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` to `apps/web`. _Files: `apps/web/package.json`_
- [x] **Make KanbanBoard columns droppable** — Each status column is a `SortableContext` drop zone. Each issue card uses `useSortable`. On drop: calls `PATCH /issues/:key` with new `statusId` + sortOrder, optimistically updates UI. _Files: `apps/web/src/features/boards/KanbanBoard.tsx`_
- [x] **Add drag overlay** — Ghost card follows cursor while dragging (border-primary, shadow-lg). Target column highlights with blue ring. Source card goes semi-transparent. 5px activation threshold prevents accidental drags. _Files: `apps/web/src/features/boards/KanbanBoard.tsx`_
- [x] **Optimistic updates** — Local state snapshot on drag start, immediate UI update on drag over/end, rollback + invalidation on API error. _Files: `apps/web/src/features/boards/KanbanBoard.tsx`_
- [x] **Add API hooks** — `useUpdateIssueDynamic()` for updating any issue by key, `useReorderIssues()` for bulk reorder. _Files: `apps/web/src/api/hooks.ts`, `apps/web/src/api/index.ts`_
- [x] **Make IssueListPage rows sortable** — Added permission-aware drag handles, keyboard sorting, paginated sort offsets, optimistic updates, and persistence through the bulk reorder endpoint. Explicit column sorting disables manual reordering so the active sort remains truthful. _Files: `apps/web/src/features/issues/IssueListPage.tsx`, `apps/web/src/features/issues/dragAndDrop.ts`_
- [x] **Sprint planning drag** — SprintBoard now renders issues in active and planned sprint containers plus Backlog. Issues can move between those containers, including `sprintId=null`, with keyboard controls, optimistic updates, and completed sprints kept read-only. _Files: `apps/web/src/features/boards/SprintBoard.tsx`, `apps/web/src/features/issues/dragAndDrop.ts`_

### Tests

- [x] **E2E: reorder issues** — `PATCH /issues/reorder` changes sortOrder correctly. Verify order in subsequent GET. Also tests 404 for non-existent issue. _File: `apps/api/test/drag-and-drop.e2e-spec.ts`_
- [x] **E2E: move issue between statuses** — PATCH with new statusId, verify status changed. Verify activity log entry created with action `updated`, fieldName `status`. _File: `apps/api/test/drag-and-drop.e2e-spec.ts`_
- [x] **E2E: move issue between sprints** — PATCH with sprintId assigns issue to sprint. PATCH with `sprintId: null` removes it. _File: `apps/api/test/drag-and-drop.e2e-spec.ts`_
- [x] **E2E: permission check** — Viewer cannot reorder (403) or move status (403). Member can reorder (204) and move status (200). _File: `apps/api/test/drag-and-drop.e2e-spec.ts`_
- [x] **Frontend: drag state transitions** — Unit coverage verifies list reordering, paginated offsets, same-column Kanban ordering, empty-container drops, sprint assignment, and backlog assignment. _File: `apps/web/src/features/issues/dragAndDrop.test.ts`_
- [x] **Frontend: responsive application shell** — Regression coverage verifies the project sidebar is hidden at mobile widths so sprint planning remains usable on narrow screens. _File: `apps/web/src/layouts/AppLayout.test.tsx`_

## Acceptance Criteria

- [x] Issues can be dragged between Kanban columns (status change)
- [x] Issues can be reordered within a column (sortOrder change)
- [x] Issues can be dragged between sprints in SprintBoard
- [x] Drag shows ghost overlay and target highlight
- [x] UI updates instantly (optimistic), rolls back on API failure
- [x] `sortOrder` persisted and respected in all list/board queries
- [x] All field changes (assignee, status, sprint, priority, dates, summary, percentDone) tracked in activity log

## Remaining

The core drag-and-drop scope is complete. Feature 10 can build on these primitives for richer backlog capacity, filtering, and planning workflows without duplicating issue movement behavior.

## Dependencies

- None
