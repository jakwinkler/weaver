# Story Points & Estimation

**Status: Implemented.** Story points are native issue data with editing and planning/report totals.

Reconciled September 23, 2026 against main [`27b14d7`](https://github.com/jakwinkler/weaver/commit/27b14d72ab8d201c4bf4fcbffd00830091dd21ce). This is the source baseline, which can differ from the checked-out application branch. Checked implementation items below mean the code exists; they do not certify a release or a fresh test pass.

User guide: [Working with Issues](https://github.com/jakwinkler/weaver/wiki/Working-with-Issues).

## Implemented

- [x] Nullable integer storyPoints on issue create/update/read and list responses.
- [x] Detail/create/list editing through StoryPointsField, including common-value choices and clear-to-null.
- [x] Board card badges and column totals; committed/capacity totals in sprint containers.
- [x] Committed/completed aggregation in sprint statistics and reports.

## Differences from the original plan

- Story points are not limited to custom fields. The native field accepts integers from 0 through 100 or null.
- Zero is an estimate; null is unestimated. Totals treat missing estimates as zero.
- SprintBoard's header does not itself show both committed and completed totals; use the statistics/report surface for completion.

## Remaining work and verification

- [ ] Verify list/create/detail edits and totals after scope, status, and estimate changes.
- [ ] Add a completed-points header display only if the original SprintBoard-specific display requirement is still desired.

## Evidence

Local estimated issues persisted and appeared in board/backlog totals. The API suite covers creating, clearing, and aggregating points.

### Implementation

- [packages/db/src/entities/tenant/issue.entity.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/packages/db/src/entities/tenant/issue.entity.ts)
- [packages/shared/src/schemas/index.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/packages/shared/src/schemas/index.ts)
- [apps/web/src/components/StoryPointsField.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/components/StoryPointsField.tsx)
- [apps/web/src/features/boards/SprintBoard.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/features/boards/SprintBoard.tsx)

### Existing automated coverage, not rerun for this documentation edit

- [apps/api/test/story-points.e2e-spec.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/test/story-points.e2e-spec.ts)

## Dependencies

- None
