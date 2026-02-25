# Story Points & Estimation

> First-class story points field on issues, with total display in sprints and boards.

## Why
Story points are the standard estimation unit in Scrum. While custom fields can technically store them, native support enables capacity planning, velocity charts, and sprint scope bars.

## Current State
- Custom fields support 'number' type (could be used for points)
- No native storyPoints field on issues
- No aggregation of points in sprints or boards

## Tasks

### Backend
- [ ] **Add storyPoints column to IssueEntity** — `storyPoints: number | null`, default null. Add to createIssueSchema and updateIssueSchema as optional field. _Files: `packages/db/src/entities/tenant/issue.entity.ts`, `packages/shared/src/schemas/index.ts`_
- [ ] **Include storyPoints in issue responses** — Ensure GET /issues/:key and list endpoints return storyPoints. _Files: `apps/api/src/modules/issues/issues.service.ts`_
- [ ] **Sprint points aggregation** — In sprint stats, sum storyPoints for total committed and total completed (based on terminal status). _Files: `apps/api/src/modules/sprints/sprints.service.ts`_
- [ ] **Board column points** — In board issues response, include total points per status column. _Files: `apps/api/src/modules/boards/boards.service.ts`_

### Frontend
- [ ] **Story points in issue detail** — Add points field in sidebar (small number input, common values: 1, 2, 3, 5, 8, 13, 21). Show quick-select chips. _Files: `apps/web/src/features/issues/IssueDetailPage.tsx`_
- [ ] **Story points in issue list** — New column showing points. Inline editable. _Files: `apps/web/src/features/issues/IssueListPage.tsx`_
- [ ] **Story points on board cards** — Small badge showing points on each card. _Files: `apps/web/src/features/boards/KanbanBoard.tsx`_
- [ ] **Column point totals** — Show total points in each column header: "To Do (21 pts)". _Files: `apps/web/src/features/boards/KanbanBoard.tsx`_
- [ ] **Sprint points in sprint board** — Show committed/completed points in sprint header. _Files: `apps/web/src/features/boards/SprintBoard.tsx`_
- [ ] **Story points in create issue form** — Optional field with Fibonacci chips (1, 2, 3, 5, 8, 13). _Files: `apps/web/src/features/issues/IssueListPage.tsx`_

### Tests
- [ ] **E2E: create issue with story points** — POST with storyPoints=5, verify GET returns 5. _File: `apps/api/test/story-points.e2e-spec.ts`_
- [ ] **E2E: update story points** — PATCH with storyPoints=8, verify. _File: `apps/api/test/story-points.e2e-spec.ts`_
- [ ] **E2E: sprint stats include points** — Add pointed issues to sprint, verify stats. _File: `apps/api/test/story-points.e2e-spec.ts`_

## Acceptance Criteria
- Issues have an optional storyPoints field
- Points visible on board cards and list rows
- Column headers show total points
- Sprint shows committed vs completed points
- Fibonacci quick-select chips in issue forms
- Points included in sprint statistics

## Dependencies
- None
