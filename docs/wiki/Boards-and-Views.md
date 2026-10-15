# Boards and project views

Use a board to see work by status and move it through the project's workflow. Use the issue list for detailed sorting, the calendar for dates, and the Gantt view for work laid out over time. These are views of the same issues.

## Move work on a board

Open the project and choose **Board**. Drag a card by its handle to a valid destination column, or reorder it within its current column. A successful move saves the issue's status and order. If the workflow rejects a move, the card returns and an error explains the failure.

The October pilot browser check moved a card and confirmed its new status after reloading the page. Members with access to the project see readable status names and allowed transitions without workflow-administration permission.

Open a card to read its description or change its details. Arrow keys move focus between board cards, and Enter opens the focused card. See [Keyboard Shortcuts](https://github.com/jakwinkler/weaver/wiki/Keyboard-Shortcuts).

![A populated board with status columns, story points, and a WIP counter](https://raw.githubusercontent.com/wiki/jakwinkler/weaver/images/board.png)

*The example board has two issues in progress against a WIP limit of three. Some board assignee labels currently fall back to a shortened user ID; the issue detail page shows the person's name.*

## Group the board into swimlanes

Use **Group by** to choose None, Assignee, Priority, or Epic. Each group gets its own horizontal lane, and you can collapse lanes you do not need to see. Grouping helps answer a specific question: who owns the work, which items are urgent, or which epic has unfinished work.

The grouping is saved with the board. It is shared board configuration, so choose a grouping that is useful to the team.

## Set a work-in-progress limit

Choose **WIP limits** and set a positive limit for a status column. The counter compares the number of issues in that status with the limit. The column warns when it reaches or exceeds the limit.

WIP limits are advisory. They warn when you move more work into a full column but do not prevent the move. They count issues, not story points. Use them to prompt a conversation about finishing existing work before starting more.

## Choose another view

| View | Use it for |
| --- | --- |
| Issues | Sorting, inline edits, and bulk updates |
| Board | Workflow status and work in progress |
| Backlog | Prioritizing unscheduled work and assigning sprints |
| Sprints | Running the active sprint and managing planned sprints |
| Roadmap | Epic dates, progress, and dependencies |
| Gantt | Reviewing individual issue date ranges |
| Calendar | Seeing dated work on a calendar |
| Wiki | Keeping project instructions and reference material |

Board, sprint, Gantt, and calendar features depend on their plugins and project settings. If a view is unavailable, see [Plugins](https://github.com/jakwinkler/weaver/wiki/Plugins). For epic-level planning, use [Roadmaps and Epics](https://github.com/jakwinkler/weaver/wiki/Roadmaps-and-Epics).

---

## Technical reference (developers and LLMs)

The guidance above covers everyday use. The details below explain API contracts, implementation, and operational limits.

Boards store `config.swimlaneField` (`none`, `assignee`, `priority`, or `epic`) and `config.wipLimits`, a mapping of status UUIDs to positive integers. Limits are validated from 1 to 9999. A WIP counter does not impose a server-side hard capacity constraint.

Create/list boards at `/boards?projectId=<uuid>`. Read/update a board at `/boards/:id`; `/boards/:id/issues` returns board data including issue grouping. The board endpoint currently loads all issues in the project without pagination, so large boards can take longer to load. Use the paginated issue list when you need to browse a large project in smaller sets.

Dragging across statuses uses the issue update path and workflow validation. Same-column moves persist order. Project feature records and tenant-installed plugin records are separate and both affect visibility.

The pilot release checks tenant installation/enabled state and project enablement when these optional views are opened directly. The board drag handler compares the proposed status with the persisted issue before saving, so a visually moved card is backed by a request.

### Source reference

Checked against source revision [`1b1b370`](https://github.com/jakwinkler/weaver/commit/1b1b3704c37b4d1ab09347508d57968e1de38130).

- [apps/web/src/features/boards/KanbanBoard.tsx](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/web/src/features/boards/KanbanBoard.tsx)
- [apps/web/src/features/boards/BoardSettings.tsx](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/web/src/features/boards/BoardSettings.tsx)
- [apps/api/src/modules/boards/boards.service.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/api/src/modules/boards/boards.service.ts)
- [apps/api/src/modules/projects/project-plugins.service.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/api/src/modules/projects/project-plugins.service.ts)

Pilot update checked against [`ce5494a`](https://github.com/jakwinkler/weaver/commit/ce5494a445f0a5412cf7e0be378308afbeb5e5f8): [Kanban board](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/apps/web/src/features/boards/KanbanBoard.tsx), [board issue query](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/apps/api/src/modules/boards/boards.service.ts), [feature gate](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/apps/web/src/features/projects/useProjectFeatureEnabled.ts), and [pilot readiness](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/apps/web/e2e/READINESS-2026-10-14.md).
