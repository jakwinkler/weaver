# Backlog & Sprint Planning

**Status: Implemented with gaps.** Backlog planning, capacity display, filtering, quick creation, and sprint movement are present.

Reconciled September 23, 2026 against main [`27b14d7`](https://github.com/jakwinkler/weaver/commit/27b14d72ab8d201c4bf4fcbffd00830091dd21ce). This is the source baseline, which can differ from the checked-out application branch. Checked implementation items below mean the code exists; they do not certify a release or a fresh test pass.

User guide: [Sprints and Reports](https://github.com/jakwinkler/weaver/wiki/Sprints-and-Reports).

## Implemented

- [x] Backlog query/filter API, sprint assignment endpoint, capacity field, and sprint statistics.
- [x] Backlog route with active/planned containers, collapsible sections, points/capacity display, and over-capacity feedback.
- [x] Sortable movement among containers, optimistic recovery, filters, quick creation, and project navigation.
- [x] One active sprint per project; completion returns non-terminal issues to backlog.

## Differences from the original plan

- The backlog and capacity UI exist; the previous missing-feature claims were stale.
- Capacity is accepted on create, but the PATCH controller schema omits it even though the service type supports it.
- Backlog planning fetches a bounded first set, not every issue in a large project.
- SprintBoard headers show committed/capacity points; completed-point reporting is available through statistics/reports.

## Remaining work and verification

- [ ] Expose and verify capacity editing in the controller/UI if intended for planned sprints.
- [ ] Fix the observed previous-day date labels west of UTC and assignee ID fallbacks.
- [ ] Handle more than 200 backlog/project issues and repeat complete sprint lifecycle/drag acceptance.

## Evidence

Local active/planned sprints, estimates, assignments, statistics, and backlog rendering were checked. Date-label and assignee fallback problems were observed; capacity PATCH omission was source-confirmed.

### Implementation

- [apps/api/src/modules/sprints/sprints.controller.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/src/modules/sprints/sprints.controller.ts)
- [apps/api/src/modules/sprints/sprints.service.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/src/modules/sprints/sprints.service.ts)
- [apps/web/src/features/boards/BacklogView.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/features/boards/BacklogView.tsx)
- [apps/web/src/features/boards/SprintContainer.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/features/boards/SprintContainer.tsx)

### Existing automated coverage, not rerun for this documentation edit

- [apps/api/test/backlog.e2e-spec.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/test/backlog.e2e-spec.ts)
- [apps/web/src/features/boards/backlogPlanning.test.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/features/boards/backlogPlanning.test.ts)

## Dependencies

- 01-drag-and-drop (core DnD infrastructure with @dnd-kit)
- 12-story-points (for capacity planning -- story points field on issues)
