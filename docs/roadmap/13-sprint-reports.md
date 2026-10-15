# Sprint Reports

**Status: Implemented; full-cycle verification pending.** Burndown, velocity, scope snapshots, and sprint summaries exist.

Reconciled September 23, 2026 against main [`27b14d7`](https://github.com/jakwinkler/weaver/commit/27b14d72ab8d201c4bf4fcbffd00830091dd21ce). This is the source baseline, which can differ from the checked-out application branch. Checked implementation items below mean the code exists; they do not certify a release or a fresh test pass.

User guide: [Sprints and Reports](https://github.com/jakwinkler/weaver/wiki/Sprints-and-Reports).

## Implemented

- [x] Initial sprint scope snapshot, daily burndown, summary, and project velocity endpoints.
- [x] Recharts burndown and velocity components, summary cards, and report routes/navigation.
- [x] Activity/scope-based handling of completed work, scope additions/removals, and estimates.

## Differences from the original plan

- Both report endpoints and chart rendering are implemented.
- Reports reconstruct recorded history; imported or missing activity cannot be treated as an exact historical sprint record.

## Remaining work and verification

- [ ] Run a completed sprint through scope additions/removals, estimate changes, reopening, and report rendering.
- [ ] Bound and validate requested sprint date spans before materializing one burndown point per day.
- [ ] Verify date-only display consistently across the planning and reporting screens.

## Evidence

Local statistics were checked; source/tests cover a 13-point burndown, scope changes, and velocity. The documentation walkthrough did not simulate a full completed sprint.

### Implementation

- [apps/api/src/modules/sprints/sprints.service.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/src/modules/sprints/sprints.service.ts)
- [apps/web/src/features/reports/SprintReportPage.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/features/reports/SprintReportPage.tsx)
- [apps/web/src/features/reports/BurndownChart.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/features/reports/BurndownChart.tsx)
- [apps/web/src/features/reports/VelocityPage.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/features/reports/VelocityPage.tsx)

### Existing automated coverage, not rerun for this documentation edit

- [apps/api/test/sprint-reports.e2e-spec.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/test/sprint-reports.e2e-spec.ts)

## Dependencies

- 12-story-points (points data for charts)
- 10-backlog-sprint-planning (sprint lifecycle)
