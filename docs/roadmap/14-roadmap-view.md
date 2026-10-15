# Roadmap View

**Status: Implemented.** The epic timeline includes progress, child expansion, dependencies, zoom, and date resizing.

Reconciled September 23, 2026 against main [`27b14d7`](https://github.com/jakwinkler/weaver/commit/27b14d72ab8d201c4bf4fcbffd00830091dd21ce). This is the source baseline, which can differ from the checked-out application branch. Checked implementation items below mean the code exists; they do not certify a release or a fresh test pass.

User guide: [Roadmaps and Epics](https://github.com/jakwinkler/weaver/wiki/Roadmaps-and-Epics).

## Implemented

- [x] Epic endpoint with child counts, terminal completion, story-point totals, and derived date bounds.
- [x] Month/quarter timeline, scrolling, Today marker, status-colored epic bars, and child expansion.
- [x] SVG blocking-dependency arrows and permission-aware edge resizing with save/error handling.
- [x] Project roadmap navigation.

## Differences from the original plan

- The epic roadmap is separate from the issue-level Gantt view and is already implemented.
- Explicit epic dates take precedence; missing bounds derive from children. Display fallback spans are not automatically saved issue dates.
- Completion by child count and completion by story points are distinct measures.

## Remaining work and verification

- [ ] Repeat resize persistence/error recovery, dependency rendering, and keyboard interactions in the browser.
- [ ] Check undated epics, empty children, zero-point totals, and large timelines.

## Evidence

Local epic bars, children, dates, and progress were inspected. Edge dragging and dependency interactions were source-reviewed, not fully exercised in that walkthrough.

### Implementation

- [apps/api/src/modules/issues/issues.service.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/src/modules/issues/issues.service.ts)
- [apps/web/src/features/boards/RoadmapView.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/features/boards/RoadmapView.tsx)
- [apps/web/src/features/boards/roadmapTimeline.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/features/boards/roadmapTimeline.ts)

### Existing automated coverage, not rerun for this documentation edit

- [apps/api/test/roadmap.e2e-spec.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/test/roadmap.e2e-spec.ts)
- [apps/web/src/features/boards/roadmapTimeline.test.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/features/boards/roadmapTimeline.test.ts)

## Dependencies

- 12-story-points (for point-based progress)
