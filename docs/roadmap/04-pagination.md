# Pagination & Sorting

> Add pagination controls, sortable columns, and page-size selector to all list views.

## Why

Currently, list views fetch data with pagination params but the UI has no controls to navigate pages, change page size, or sort by column. Users see only page 1 with no way to see more.

## Current State

- Backend `paginate()` helper returns `{ data, meta: { page, perPage, total, totalPages } }`
- API hooks pass pagination params (page, perPage, sort)
- Pagination, sorting, and page-size controls available on Issue and Project list views
- perPage preference persisted in localStorage
- Page/sort reflected in URL query params

## Tasks

### Frontend

- [x] **Create Pagination component** — Reusable component showing: page numbers (with ellipsis), prev/next buttons, "Showing X-Y of Z" text, page size selector (10, 25, 50, 100). _Files: `apps/web/src/components/Pagination.tsx`_
- [x] **Create SortableHeader component** — Table header that shows sort direction arrow. Clicking toggles asc/desc/none. _Files: `apps/web/src/components/SortableHeader.tsx`_
- [x] **Add pagination to IssueListPage** — Wire Pagination component to page/perPage state. Pass to `useProjectIssues`. Add sortable headers for Key, Summary, Priority, Due Date, Created. _Files: `apps/web/src/features/issues/IssueListPage.tsx`_
- [x] **Add pagination to ProjectsPage** — Wire Pagination to `useProjects`. Add sortable headers for Key, Name. _Files: `apps/web/src/features/projects/ProjectsPage.tsx`_
- [ ] **Add pagination to search results** — Wire to search API response meta. _Files: `apps/web/src/features/search/SearchPage.tsx`_
- [x] **Persist pagination preferences** — Store perPage in localStorage. Restore on page load. _Files: `apps/web/src/components/Pagination.tsx`_
- [x] **URL sync** — Reflect page/sort in URL query params (`?page=2&sort=priority`). Restore from URL on load. _Files: all list pages_

### Backend

- [x] **Validate sortBy against allowed fields** — `paginate()` rejects unknown sort fields with 400. All services pass `allowedSortFields` param. _Files: `apps/api/src/common/pagination.ts`_

### Tests

- [x] **E2E: pagination params work** — `GET /projects?page=1&perPage=1` returns correct slice (existing test). _File: `apps/api/test/projects-issues.e2e-spec.ts`_
- [x] **E2E: sort params work** — `GET /projects?sort=name` returns sorted results (existing test). _File: `apps/api/test/projects-issues.e2e-spec.ts`_
- [x] **E2E: invalid sortBy rejected** — `GET /projects?sort=invalid` returns 400 (existing test). _File: `apps/api/test/projects-issues.e2e-spec.ts`_

## Acceptance Criteria

- [x] All list views show pagination controls with page numbers
- [x] Page size selectable (10, 25, 50, 100)
- [x] "Showing 1-25 of 142" text visible
- [x] Column headers clickable to sort asc/desc
- [x] Sort direction shown with arrow icon
- [x] Page/sort reflected in URL (shareable links)
- [x] Page size preference persisted in localStorage

## Dependencies

- None
