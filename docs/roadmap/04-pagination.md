# Pagination & Sorting

**Status: Implemented with limits.** Issue and project lists have pagination and sorting; aggregate views still need complete-data handling.

Reconciled September 23, 2026 against main [`27b14d7`](https://github.com/jakwinkler/weaver/commit/27b14d72ab8d201c4bf4fcbffd00830091dd21ce). This is the source baseline, which can differ from the checked-out application branch. Checked implementation items below mean the code exists; they do not certify a release or a fresh test pass.

User guide: [Working with Issues](https://github.com/jakwinkler/weaver/wiki/Working-with-Issues).

## Implemented

- [x] Paginated API responses with data and page/perPage/total/totalPages metadata.
- [x] Issue/project page controls, sortable columns, page-size selection, stored preference, and URL state.
- [x] Allowlisted sort fields and stable ID tie-breaking in the shared pagination helper.

## Differences from the original plan

- The sort contract is `sort=field` or `sort=-field`; there is no separate generic `order` parameter.
- Ordinary list pagination does not prove completeness of boards, backlog, dashboards, or exports that fetch a fixed first page.

## Remaining work and verification

- [ ] Replace or clearly expose fixed fetch caps in aggregate views; board/backlog planning currently requests up to 200 issues per fetch.
- [ ] Verify filters, page changes, empty last pages, and sort persistence with a dataset spanning several pages.

## Evidence

Local lists loaded with synthetic data. Large-dataset completeness was not exercised; the fetch limit is visible in source.

### Implementation

- [apps/api/src/common/pagination.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/src/common/pagination.ts)
- [apps/web/src/features/issues/IssueListPage.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/features/issues/IssueListPage.tsx)
- [apps/web/src/features/projects/ProjectsPage.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/features/projects/ProjectsPage.tsx)
- [apps/web/src/features/boards/BacklogView.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/features/boards/BacklogView.tsx)

### Existing automated coverage, not rerun for this documentation edit

- [apps/api/src/common/pagination.spec.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/src/common/pagination.spec.ts)

## Dependencies

- None
