# Inline Editing

> Click any cell in a list view to edit it in-place — summary, priority, assignee, status, dates.

## Why

Currently, editing an issue requires navigating to the detail page. In Jira/ClickUp, you click a cell and edit right there. This dramatically speeds up triage and backlog grooming.

## Current State

- IssueListPage shows a read-only table
- `PATCH /issues/:key` supports partial updates (summary, priority, assigneeId, statusId, dates, labels)
- No inline editing components exist

## Tasks

### Frontend

- [ ] **Create EditableCell component** — Generic component: displays value, on click switches to input/select. On blur or Enter, calls onSave callback. On Escape, reverts. Shows loading spinner during save. _Files: `apps/web/src/components/EditableCell.tsx`_
- [ ] **Create InlineSelect component** — Dropdown select for status, priority, assignee. Opens on click, closes on select or blur. _Files: `apps/web/src/components/InlineSelect.tsx`_
- [ ] **Create InlineDatePicker component** — Date picker that opens on click for start/due dates. _Files: `apps/web/src/components/InlineDatePicker.tsx`_
- [ ] **Wire IssueListPage cells** — Replace static cells with EditableCell/InlineSelect for: summary (text input), priority (select), status (select with workflow transitions), assignee (user select), due date (date picker). _Files: `apps/web/src/features/issues/IssueListPage.tsx`_
- [ ] **Optimistic updates in list** — Use React Query `setQueryData` for instant feedback. Rollback on error with toast. _Files: `apps/web/src/features/issues/IssueListPage.tsx`_
- [ ] **Tab navigation** — Tab key moves to next editable cell in the row. Shift+Tab moves back. _Files: `apps/web/src/components/EditableCell.tsx`_
- [ ] **Permission checks** — Only show edit affordance if user has `issues.update` permission. Viewers see read-only cells. _Files: `apps/web/src/features/issues/IssueListPage.tsx`_

### Tests

- [ ] **E2E: PATCH updates persist** — Inline edit summary via API, verify GET returns new value. (Backend already tested, this confirms no regressions.) _File: existing e2e tests_

## Acceptance Criteria

- Click on summary text to edit inline (text input)
- Click on priority/status/assignee to get dropdown
- Click on date to get date picker
- Enter saves, Escape cancels
- Changes save immediately (optimistic)
- Error shows toast and reverts value
- Tab navigates between cells
- Viewers see no edit affordance

## Dependencies

- 04-pagination (inline editing works alongside sortable/paginated tables)
