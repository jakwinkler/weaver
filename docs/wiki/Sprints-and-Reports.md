# Plan sprints and read the reports

Use the backlog to prioritize work, then move a realistic amount into a planned sprint. Start the sprint when the team begins. Completing it keeps finished issues in that sprint and sends unfinished issues back to the backlog.

Only one sprint can be active in a project. The Sprints plugin must be installed and enabled for the project, and your role must allow the relevant sprint actions.

## Plan a sprint

1. Open **Sprints** and create a sprint with a name, goal, and dates. Add a capacity in story points when useful.
2. Open **Backlog** to see unscheduled issues next to active and planned sprints.
3. Filter backlog issues by priority, assignee, or type. Drag work into the intended sprint or back to the backlog.
4. Check the issue count and committed points. Compare points with capacity; missing estimates count as zero in totals.
5. Review the goal and dates before choosing **Start Sprint**.

Use valid calendar dates, with the end on or after the start and no more than 366 days later. The API accepts up to 100 issue IDs in one add-to-sprint request.

![Backlog planning with active and planned sprints, points, and unscheduled issues](https://raw.githubusercontent.com/wiki/jakwinkler/weaver/images/backlog.png)

*The example has 16 points assigned to an active sprint with capacity 21. The date display has a known timezone issue described below.*

A sprint's name, goal, and dates can be edited while it is planned. The current API does not support editing or deleting an active or completed sprint. Decide those details before starting it.

## Run and complete a sprint

Move issue statuses as work progresses. Add or remove scope deliberately; reports distinguish original commitment from later changes.

When the sprint ends, review completed and unfinished work, then use **Complete Sprint**. Completion is a real change, not just a report view. Issues in terminal workflow statuses stay in the completed sprint. Non-terminal issues return to the backlog so the team can replan them. Completed sprints are read-only planning containers.

## Read the reports

Open the sprint report from the sprint view. Use the **Burndown** chart to compare remaining story points with the ideal line. The summary describes committed and completed work and scope changes. **Velocity** compares commitment and completion across recent completed sprints.

Points measure your team's estimates. They are not hours and should not be used to compare individual productivity. A flat or surprising burndown can reflect unestimated issues, added scope, estimate changes, or a workflow status that is not marked terminal.

## Current limits to know

The pilot release corrected date-only rendering on the main sprint board. The backlog's sprint container still parses a date-only value as UTC and can display it one day earlier in browsers west of UTC. Confirm important dates against the entered/stored values there until that display is corrected.

Capacity is accepted when creating a sprint, but the current PATCH controller does not expose capacity changes. Do not expect an API capacity edit to persist. Report history is reconstructed from the recorded scope and activity, so imported or incomplete historical data may not tell the same story as a sprint run entirely in Weaver.

Continue with [Roadmaps and Epics](https://github.com/jakwinkler/weaver/wiki/Roadmaps-and-Epics) or [Working with Issues](https://github.com/jakwinkler/weaver/wiki/Working-with-Issues).

---

## Technical reference (developers and LLMs)

The guidance above covers everyday use. The details below explain API contracts, implementation, and operational limits.

Sprint creation and listing use `/sprints?projectId=<uuid>`. Lifecycle routes are `POST /sprints/:id/start` and `POST /sprints/:id/complete`. Reports use `GET /sprints/:id/stats`, `/burndown`, and `/summary`; velocity uses `GET /projects/:projectKey/velocity`.

Starting captures `initialScope`, including each issue's UUID, points, and status. A project-level advisory lock enforces the one-active-sprint rule. Completion identifies finished work by `WorkflowStatusEntity.isTerminal`, not by the text “Done” or manual percent complete.

The update controller accepts name, goal, start date, and end date. Although the service type includes capacity, the controller schema strips it. Completion moves non-terminal issues to `sprintId = null` in the same tenant transaction.

The pilot API validates calendar dates, requires a nonnegative date range of at most 366 days, and limits the add-issues payload to 100 IDs.

### Source reference

Checked against source revision [`1b1b370`](https://github.com/jakwinkler/weaver/commit/1b1b3704c37b4d1ab09347508d57968e1de38130).

- [apps/api/src/modules/sprints/sprints.controller.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/api/src/modules/sprints/sprints.controller.ts)
- [apps/api/src/modules/sprints/sprints.service.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/api/src/modules/sprints/sprints.service.ts)

Pilot update checked against [`ce5494a`](https://github.com/jakwinkler/weaver/commit/ce5494a445f0a5412cf7e0be378308afbeb5e5f8): [sprint controller](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/apps/api/src/modules/sprints/sprints.controller.ts), [sprint service](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/apps/api/src/modules/sprints/sprints.service.ts), [sprint board](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/apps/web/src/features/boards/SprintBoard.tsx), [backlog container](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/apps/web/src/features/boards/SprintContainer.tsx).
- [apps/web/src/features/boards/BacklogView.tsx](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/web/src/features/boards/BacklogView.tsx)
- [apps/web/src/features/boards/SprintContainer.tsx](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/web/src/features/boards/SprintContainer.tsx)
- [apps/web/src/features/reports/SprintReportPage.tsx](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/web/src/features/reports/SprintReportPage.tsx)
