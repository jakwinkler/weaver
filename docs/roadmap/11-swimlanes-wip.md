# Board Swimlanes & WIP Limits

> Group board cards into horizontal swimlanes (by assignee, priority, epic) and set WIP limits per column.

## Why
Swimlanes organize busy boards into manageable rows. WIP limits enforce team process (a key Kanban principle). Both are Jira board essentials.

## Current State
- KanbanBoard renders flat columns by status
- Board entity has `config` JSONB field (unused)
- No swimlane grouping, no WIP limit enforcement

## Tasks

### Backend
- [ ] **Add board config schema** — Define `config` structure: `{ swimlaneField?: 'assignee' | 'priority' | 'epic' | 'none', wipLimits?: Record<statusId, number> }`. Validate on board create/update. _Files: `apps/api/src/modules/boards/boards.service.ts`_
- [ ] **Return grouped issues in board endpoint** — When `GET /boards/:id/issues` and board has swimlaneField, return issues grouped by that field value. _Files: `apps/api/src/modules/boards/boards.service.ts`_

### Frontend
- [ ] **Swimlane renderer** — When board config has swimlaneField, render horizontal swimlane rows. Each row has a label (assignee name, priority, epic name) and columns within it. Collapsible rows. _Files: `apps/web/src/features/boards/KanbanBoard.tsx`_
- [ ] **Swimlane selector** — Dropdown in board header: "Group by: None / Assignee / Priority / Epic". Persists to board config via PATCH. _Files: `apps/web/src/features/boards/KanbanBoard.tsx`_
- [ ] **WIP limit display** — Show column header as "In Progress (3/5)" with count/limit. Column header turns red when at or over limit. _Files: `apps/web/src/features/boards/KanbanBoard.tsx`_
- [ ] **WIP limit config** — In board settings (or inline edit on column header), set max cards per column. _Files: `apps/web/src/features/boards/BoardSettings.tsx`_
- [ ] **WIP limit warning** — When dragging to a full column, show warning but still allow drop (soft limit, Jira-style). _Files: `apps/web/src/features/boards/KanbanBoard.tsx`_

### Tests
- [ ] **E2E: board config persists** — PATCH board config with swimlaneField and wipLimits, GET returns same. _File: `apps/api/test/boards.e2e-spec.ts`_
- [ ] **E2E: grouped issues** — Create issues with different assignees, GET board with swimlaneField=assignee, verify grouping. _File: `apps/api/test/boards.e2e-spec.ts`_

## Acceptance Criteria
- Board can be grouped by assignee, priority, or epic
- Swimlane rows are collapsible
- WIP limits show as "X/Y" in column headers
- Over-limit columns highlighted in red
- Drag to full column shows warning but allows it
- Board config persisted server-side

## Dependencies
- 01-drag-and-drop (DnD in swimlane context)
