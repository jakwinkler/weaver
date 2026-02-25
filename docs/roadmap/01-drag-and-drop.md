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
- [ ] **Make IssueListPage rows sortable** — Enable drag handle on each row. On drop: call bulk reorder endpoint. _Files: `apps/web/src/features/issues/IssueListPage.tsx`_
- [ ] **Sprint planning drag** — In SprintBoard, make issues draggable between sprint containers and a "Backlog" container (sprintId=null). On drop: call `PATCH /issues/:key` with new `sprintId`. _Files: `apps/web/src/features/boards/SprintBoard.tsx`_

### Tests

- [x] **E2E: reorder issues** — `PATCH /issues/reorder` changes sortOrder correctly. Verify order in subsequent GET. Also tests 404 for non-existent issue. _File: `apps/api/test/drag-and-drop.e2e-spec.ts`_
- [x] **E2E: move issue between statuses** — PATCH with new statusId, verify status changed. Verify activity log entry created with action `updated`, fieldName `status`. _File: `apps/api/test/drag-and-drop.e2e-spec.ts`_
- [x] **E2E: move issue between sprints** — PATCH with sprintId assigns issue to sprint. PATCH with `sprintId: null` removes it. _File: `apps/api/test/drag-and-drop.e2e-spec.ts`_
- [x] **E2E: permission check** — Viewer cannot reorder (403) or move status (403). Member can reorder (204) and move status (200). _File: `apps/api/test/drag-and-drop.e2e-spec.ts`_

## Acceptance Criteria

- [x] Issues can be dragged between Kanban columns (status change)
- [x] Issues can be reordered within a column (sortOrder change)
- [ ] Issues can be dragged between sprints in SprintBoard
- [x] Drag shows ghost overlay and target highlight
- [x] UI updates instantly (optimistic), rolls back on API failure
- [x] `sortOrder` persisted and respected in all list/board queries
- [x] All field changes (assignee, status, sprint, priority, dates, summary, percentDone) tracked in activity log

## Remaining

Two frontend tasks deferred — IssueListPage row sorting and SprintBoard drag planning. Both depend on the SprintBoard showing individual issues per sprint (currently it only shows sprint metadata). These will be addressed in Feature 10 (Backlog & Sprint Planning).

## Dependencies

- None
