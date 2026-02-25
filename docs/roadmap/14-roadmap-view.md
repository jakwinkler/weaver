# Roadmap View

> Timeline view of epics across months/quarters, showing progress and dependencies.

## Why
Product managers need a high-level view of what's planned across time. Jira, Linear, and ClickUp all have roadmap views showing epics on a timeline.

## Current State
- Issues can have `epicId` (linking to an epic issue)
- Issues have startDate and dueDate
- Issue types include 'Epic'
- GanttChart exists but shows individual issues, not epic-level aggregation
- Issue links include 'blocks' type

## Tasks

### Backend
- [ ] **Add GET /projects/:key/epics endpoint** — Return all epic-type issues with: child issue count, completed count, total story points, completed points, earliest startDate, latest dueDate (derived from children). _Files: `apps/api/src/modules/issues/issues.controller.ts`, `apps/api/src/modules/issues/issues.service.ts`_
- [ ] **Epic progress calculation** — For each epic, compute: `progress = completedChildren / totalChildren` and `pointsProgress = completedPoints / totalPoints`. _Files: `apps/api/src/modules/issues/issues.service.ts`_

### Frontend
- [ ] **Roadmap page** — Route: `/projects/:projectKey/roadmap`. Horizontal timeline with month columns. Each epic as a bar spanning its date range. Bar fill shows % complete. _Files: `apps/web/src/features/boards/RoadmapView.tsx`_
- [ ] **Timeline navigation** — Scroll left/right. Zoom: month/quarter view toggle. "Today" marker line. _Files: `apps/web/src/features/boards/RoadmapView.tsx`_
- [ ] **Epic bars** — Color by status category. Show epic name, progress %, point count. Click to expand and show child issues. _Files: `apps/web/src/features/boards/RoadmapView.tsx`_
- [ ] **Dependency lines** — Draw SVG lines between epics that have 'blocks' links. _Files: `apps/web/src/features/boards/RoadmapView.tsx`_
- [ ] **Drag to resize** — Drag epic bar edges to change start/end dates (calls PATCH). _Files: `apps/web/src/features/boards/RoadmapView.tsx`_
- [ ] **Add to project navigation** — Add "Roadmap" tab in project detail. _Files: `apps/web/src/features/projects/ProjectDetailPage.tsx`_

### Tests
- [ ] **E2E: epics endpoint** — Create epic with 3 children (1 done), verify progress and counts. _File: `apps/api/test/roadmap.e2e-spec.ts`_
- [ ] **E2E: date derivation** — Epic with no dates but children have dates, verify derived range. _File: `apps/api/test/roadmap.e2e-spec.ts`_

## Acceptance Criteria
- Roadmap shows epics as horizontal bars on a timeline
- Bars show progress fill
- Month/quarter zoom levels
- Today marker visible
- Click epic to see children
- Dependency arrows between blocking epics
- Drag bar edges to update dates

## Dependencies
- 12-story-points (for point-based progress)
