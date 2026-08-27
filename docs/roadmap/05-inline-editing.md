# Inline Editing

> Click any cell in a list view to edit it in-place — summary, priority, assignee, status, dates.

## Why

Currently, editing an issue requires navigating to the detail page. In Jira/ClickUp, you click a cell and edit right there. This dramatically speeds up triage and backlog grooming.

## Current State

- IssueListPage supports inline summary, priority, workflow status, assignee, and due-date edits
- Updates are optimistic, persist immediately, and roll back with an error toast on failure
- Editable controls are keyboard accessible and respect issue update/transition permissions

## Tasks

### Frontend

- [x] **Create EditableCell component** — Generic component: displays value, on click switches to input/select. On blur or Enter, calls onSave callback. On Escape, reverts. Shows loading spinner during save. _Files: `apps/web/src/components/EditableCell.tsx`_
- [x] **Create InlineSelect component** — Dropdown select for status, priority, assignee. Opens on click, closes on select or blur. _Files: `apps/web/src/components/InlineSelect.tsx`_
- [x] **Create InlineDatePicker component** — Date picker that opens on click for start/due dates. _Files: `apps/web/src/components/InlineDatePicker.tsx`_
- [x] **Wire IssueListPage cells** — Replace static cells with EditableCell/InlineSelect for: summary (text input), priority (select), status (select with workflow transitions), assignee (user select), due date (date picker). _Files: `apps/web/src/features/issues/IssueListPage.tsx`_
- [x] **Optimistic updates in list** — Use React Query `setQueryData` for instant feedback. Rollback on error with toast. _Files: `apps/web/src/features/issues/IssueListPage.tsx`_
- [x] **Tab navigation** — Tab key moves to next editable cell in the row. Shift+Tab moves back. _Files: `apps/web/src/components/EditableCell.tsx`_
- [x] **Permission checks** — Only show edit affordance if user has `issues.update` permission. Viewers see read-only cells. _Files: `apps/web/src/features/issues/IssueListPage.tsx`_

### Tests

- [x] **E2E: PATCH updates persist** — Inline edit summary via API, verify GET returns new value. (Backend already tested, this confirms no regressions.) _File: existing e2e tests_

## Acceptance Criteria

- [x] Click on summary text to edit inline (text input)
- [x] Click on priority/status/assignee to get dropdown
- [x] Click on date to get date picker
- [x] Enter saves, Escape cancels
- [x] Changes save immediately (optimistic)
- [x] Error shows toast and reverts value
- [x] Tab navigates between cells
- [x] Viewers see no edit affordance

## Dependencies

- 04-pagination (inline editing works alongside sortable/paginated tables)
