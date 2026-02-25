# Sprint Reports

> Burndown chart, velocity chart, and sprint summary report for completed sprints.

## Why
Sprint retrospectives need data. Burndown shows daily progress, velocity shows trend across sprints. Without reports, sprint management is blind.

## Current State
- Sprints have start/end dates and status (planned/active/completed)
- Issues track statusId and updatedAt
- Activity log records field changes with timestamps
- No chart rendering, no report endpoints

## Tasks

### Backend
- [ ] **Burndown data endpoint** — `GET /sprints/:id/burndown`. Query activity logs for status changes on sprint issues between start and end date. Return daily data points: `[{ date, totalPoints, remainingPoints, idealRemaining }]`. _Files: `apps/api/src/modules/sprints/sprints.controller.ts`, `apps/api/src/modules/sprints/sprints.service.ts`_
- [ ] **Velocity data endpoint** — `GET /projects/:key/velocity`. Return last N completed sprints with: `{ sprintName, committedPoints, completedPoints, dates }`. _Files: `apps/api/src/modules/sprints/sprints.controller.ts`, `apps/api/src/modules/sprints/sprints.service.ts`_
- [ ] **Sprint summary endpoint** — `GET /sprints/:id/summary`. Return: total issues, completed issues, added mid-sprint, removed mid-sprint, total points committed, completed, carry-over. _Files: `apps/api/src/modules/sprints/sprints.controller.ts`, `apps/api/src/modules/sprints/sprints.service.ts`_
- [ ] **Snapshot sprint scope on start** — When sprint starts, record initial issue IDs and points. This enables "added/removed mid-sprint" calculations. Add `initialScope` JSONB to SprintEntity. _Files: `packages/db/src/entities/tenant/sprint.entity.ts`, `apps/api/src/modules/sprints/sprints.service.ts`_

### Frontend
- [ ] **Install chart library** — Add `recharts` to apps/web. _Files: `apps/web/package.json`_
- [ ] **Burndown chart component** — Line chart: ideal burndown (straight line) vs actual remaining points per day. _Files: `apps/web/src/features/reports/BurndownChart.tsx`_
- [ ] **Velocity chart component** — Bar chart: committed (light) vs completed (dark) points per sprint. _Files: `apps/web/src/features/reports/VelocityChart.tsx`_
- [ ] **Sprint summary card** — Stats grid: total issues, completed, added mid-sprint, carry-over, completion %. _Files: `apps/web/src/features/reports/SprintSummary.tsx`_
- [ ] **Sprint report page** — `GET /projects/:projectKey/reports/sprint/:sprintId`. Shows burndown + summary. Add "Report" button to completed sprints in SprintBoard. _Files: `apps/web/src/features/reports/SprintReportPage.tsx`_
- [ ] **Velocity page** — `GET /projects/:projectKey/reports/velocity`. Shows velocity chart for project. _Files: `apps/web/src/features/reports/VelocityPage.tsx`_

### Tests
- [ ] **E2E: burndown data** — Start sprint with 3 issues (total 13 points), complete 1 issue, verify burndown returns correct remaining. _File: `apps/api/test/sprint-reports.e2e-spec.ts`_
- [ ] **E2E: velocity data** — Complete 2 sprints, verify velocity returns both with correct points. _File: `apps/api/test/sprint-reports.e2e-spec.ts`_
- [ ] **E2E: sprint summary** — Verify total/completed/added-mid-sprint counts. _File: `apps/api/test/sprint-reports.e2e-spec.ts`_

## Acceptance Criteria
- Burndown chart shows ideal vs actual line
- Velocity chart shows last N sprints
- Sprint summary shows key metrics
- Data accounts for mid-sprint scope changes
- Charts render with recharts (responsive)
- Report accessible from completed sprint

## Dependencies
- 12-story-points (points data for charts)
- 10-backlog-sprint-planning (sprint lifecycle)
