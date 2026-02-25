# Bulk Operations UI

> Select multiple issues in list view and apply bulk actions: change status, assign, set priority, move to sprint, delete.

## Why

Triage and grooming sessions often need to touch 10-20 issues at once. Without bulk ops, it's one-by-one clicking through each issue. This is a table-stakes feature for any serious project management tool used by teams.

## Current State

- Backend has bulk update/delete API stubs (hooks-phase6.ts references them)
- No multi-select UI in issue list
- No bulk action toolbar
- Individual issue CRUD works (PATCH /issues/:key, DELETE /issues/:key)
- Issue list page renders rows but no checkboxes

## Tasks

### Backend
- [ ] **Implement PATCH /issues/bulk endpoint** — Accept `{ issueIds: string[], updates: { statusId?, assigneeId?, priority?, sprintId?, labels? } }`. Update all issues in a single transaction. Return updated issues. Emit `issue.bulk_updated` event for webhooks and activity log. _Files: `apps/api/src/modules/issues/issues.controller.ts`, `apps/api/src/modules/issues/issues.service.ts`_
- [ ] **Implement DELETE /issues/bulk endpoint** — Accept `{ issueIds: string[] }`. Delete all in a single transaction. Clean up related data (comments, attachments, links). Return count of deleted issues. _Files: `apps/api/src/modules/issues/issues.controller.ts`, `apps/api/src/modules/issues/issues.service.ts`_
- [ ] **Permission check on bulk** — Require `issues.update` for bulk update, `issues.delete` for bulk delete. Use existing `@RequirePermission` decorator and `PermissionGuard`. _Files: `apps/api/src/modules/issues/issues.controller.ts`_
- [ ] **Limit bulk size** — Max 100 issues per bulk operation to prevent abuse and timeout. Return 400 with clear message if exceeded. _Files: `apps/api/src/modules/issues/issues.service.ts`_

### Frontend
- [ ] **Add checkbox column to IssueListPage** — Checkbox on each row. Select-all checkbox in header (selects current page only). Track selected issue IDs in component state. _Files: `apps/web/src/features/issues/IssueListPage.tsx`_
- [ ] **Bulk action toolbar** — Sticky toolbar appears when 1+ issues selected. Shows: selected count, status dropdown, assignee dropdown, priority dropdown, sprint dropdown, delete button. Disappears when selection cleared. _Files: `apps/web/src/features/issues/BulkActionBar.tsx`_
- [ ] **Confirm destructive actions** — Delete shows confirmation dialog with count of issues to be deleted. Requires explicit confirmation. _Files: `apps/web/src/features/issues/BulkActionBar.tsx`_
- [ ] **Shift+click range select** — Holding Shift and clicking selects all issues between last click and current click. Standard multi-select UX pattern. _Files: `apps/web/src/features/issues/IssueListPage.tsx`_
- [ ] **Keyboard: x toggles selection** — When list navigation is active (j/k from keyboard shortcuts), x toggles current row selection. _Files: `apps/web/src/features/issues/IssueListPage.tsx`_

### Tests
- [ ] **E2E: bulk update** — Select 3 issues, bulk change priority to 'high', verify all three updated via GET. _File: `apps/api/test/bulk-operations.e2e-spec.ts`_
- [ ] **E2E: bulk delete** — Bulk delete 2 issues, verify 404 on GET for each deleted issue. _File: `apps/api/test/bulk-operations.e2e-spec.ts`_
- [ ] **E2E: bulk size limit** — Send 101 issue IDs, expect 400 response with error message. _File: `apps/api/test/bulk-operations.e2e-spec.ts`_
- [ ] **E2E: permission check** — User with viewer role cannot bulk update (403). _File: `apps/api/test/bulk-operations.e2e-spec.ts`_

## Acceptance Criteria

- Checkboxes appear on issue list rows
- Select-all selects current page only (not all pages)
- Shift+click selects range between last and current click
- Bulk toolbar appears with selected count when 1+ selected
- Can change status, assignee, priority, sprint in bulk
- Bulk delete requires confirmation dialog
- Max 100 items per operation (400 error if exceeded)
- Permission-gated (viewers can't bulk edit or delete)
- Toolbar disappears and selection clears after successful action
- Activity log records bulk operations

## Dependencies

- 04-pagination (bulk ops work on paginated list)
- 06-keyboard-shortcuts (x to toggle selection with j/k navigation)
