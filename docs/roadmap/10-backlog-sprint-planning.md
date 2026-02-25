# Backlog & Sprint Planning

> A dedicated backlog view showing all unassigned-to-sprint issues, with drag-to-sprint planning and sprint scope management.

## Why

Sprint planning is a core Scrum ceremony. Jira's backlog view is where teams prioritize and scope sprints. Without it, sprint management is just a list -- not a planning tool. The backlog view turns sprint planning from a manual process into an interactive drag-and-drop experience.

## Current State

- SprintBoard component shows sprints with their issues
- Issues have `sprintId` (nullable foreign key to SprintEntity)
- `POST /sprints/:id/issues` adds issues to sprint
- Sprints have name, startDate, endDate, status (planned/active/completed)
- No backlog view exists (issues with sprintId=null are invisible in sprint context)
- No way to drag issues into sprints from backlog
- No sprint capacity tracking

## Tasks

### Backend
- [ ] **Add GET /projects/:key/backlog endpoint** — Return issues where `sprintId IS NULL` for the project. Support pagination and filtering (priority, assignee, issue type). Sort by sortOrder. Include total count for backlog size indicator. _Files: `apps/api/src/modules/issues/issues.controller.ts`, `apps/api/src/modules/issues/issues.service.ts`_
- [ ] **Add PATCH /issues/:key/sprint endpoint** — Move issue to sprint (or null for backlog). Update sortOrder within target container. Emit `issue.sprint_changed` event for webhooks and activity log. _Files: `apps/api/src/modules/issues/issues.controller.ts`, `apps/api/src/modules/issues/issues.service.ts`_
- [ ] **Sprint capacity** — Add optional `capacity` (story points) column to SprintEntity. Add `GET /sprints/:id/stats` returning total committed points, issue count, completed count, completed points. _Files: `packages/db/src/entities/tenant/sprint.entity.ts`, `apps/api/src/modules/sprints/sprints.service.ts`, `apps/api/src/modules/sprints/sprints.controller.ts`_

### Frontend
- [ ] **Create BacklogView page** — Two-panel layout: top = sprint containers (active + planned sprints, ordered by startDate), bottom = backlog (unassigned issues). Route: `/projects/:projectKey/backlog`. _Files: `apps/web/src/features/boards/BacklogView.tsx`_
- [ ] **Sprint container component** — Collapsible panel showing sprint name, date range, capacity bar (X/Y points), issue count, and sortable issue list within the sprint. _Files: `apps/web/src/features/boards/SprintContainer.tsx`_
- [ ] **Backlog container** — Shows all unassigned issues with sortable list. Filter bar (priority, assignee, type). Shows total issue count. _Files: `apps/web/src/features/boards/BacklogView.tsx`_
- [ ] **Drag between containers** — Drag issue from backlog to sprint container (sets sprintId). Drag from sprint to backlog (sets sprintId=null). Drag between sprints. Uses @dnd-kit/core and @dnd-kit/sortable. Optimistic update with rollback on error. _Files: `apps/web/src/features/boards/BacklogView.tsx`_
- [ ] **Sprint scope bar** — Shows capacity vs committed points as a horizontal progress bar inside each sprint container. Turns red when committed points exceed capacity. Shows "X / Y pts" label. _Files: `apps/web/src/features/boards/SprintContainer.tsx`_
- [ ] **Quick create in backlog** — Inline "Create issue" row at bottom of backlog. Type title and press Enter to create issue and append to backlog list. _Files: `apps/web/src/features/boards/BacklogView.tsx`_
- [ ] **Add navigation** — Add "Backlog" tab to project detail page alongside Board, Sprints, List, etc. Only visible when `@weaver/plugin-sprints` is enabled for the project. _Files: `apps/web/src/features/projects/ProjectDetailPage.tsx`_

### Tests
- [ ] **E2E: backlog endpoint** — Create 3 issues (1 in sprint, 2 not). GET backlog returns only the 2 unassigned issues. _File: `apps/api/test/backlog.e2e-spec.ts`_
- [ ] **E2E: move to sprint** — PATCH issue sprint to a sprint ID, verify issue appears in sprint's issue list and not in backlog. _File: `apps/api/test/backlog.e2e-spec.ts`_
- [ ] **E2E: move to backlog** — PATCH issue sprint=null, verify issue returns in backlog endpoint. _File: `apps/api/test/backlog.e2e-spec.ts`_
- [ ] **E2E: sprint stats** — Add issues with story points to sprint, verify stats endpoint returns correct total points, issue count, and completed counts. _File: `apps/api/test/backlog.e2e-spec.ts`_

## Acceptance Criteria

- Backlog shows all issues not assigned to any sprint
- Sprint containers show their assigned issues with capacity bar
- Drag issues between backlog and sprints with visual feedback
- Drag issues between different sprints
- Sprint capacity bar shows committed vs available points
- Over-capacity highlighted in red
- Quick create in backlog works (Enter to submit)
- Backlog tab visible in project navigation when sprints plugin enabled
- Collapsing/expanding sprint containers persists during session
- Filters in backlog apply correctly (priority, assignee, type)

## Dependencies

- 01-drag-and-drop (core DnD infrastructure with @dnd-kit)
- 12-story-points (for capacity planning -- story points field on issues)
