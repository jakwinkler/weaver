# Roadmaps and epics

Use **Roadmap** to see larger pieces of work over time. Each bar represents an epic; its progress comes from the issues assigned to that epic. Use the board to manage today's workflow and the roadmap to discuss milestones and dependencies.

## Build a useful roadmap

Create an issue with the Epic type, then associate related issues with it. Set start and due dates on the epic or its children. Open the project's **Roadmap** view.

Use **Month** or **Quarter** to change the view, the arrows to move along the timeline, and **Today** to return to the current date. Expand an epic to see its child issues. Click a child's issue link to open the work itself.

![Two epics on the roadmap with progress and a Today marker](https://raw.githubusercontent.com/wiki/jakwinkler/weaver/images/roadmap.png)

*The example “Launch the website” epic is 25% complete by child issue count. Its point total is a separate measure.*

## Adjust dates and interpret progress

If you can edit issues, drag either edge of an epic bar to change its start or due date. This saves dates on the epic. It does not reschedule every child issue. Confirm the result after the save, especially when several people are planning at once.

An epic with no usable dates cannot show a meaningful date range. Add dates to the epic or its children. If only one endpoint is available, the display supplies a provisional range for the missing side; give it explicit dates before treating it as a commitment.

The bar fill represents completed children divided by all children. Story-point progress is also returned by the API, but it is not the same calculation as the displayed issue-count percentage. A two-point task and an eight-point story each count as one child in the bar's percentage.

Dependency lines use “blocks” relationships between epics. These lines communicate an ordering constraint; they do not automatically shift dates. Manage relationships using the Relations feature where enabled.

---

## Technical reference (developers and LLMs)

The guidance above covers everyday use. The details below explain API contracts, implementation, and operational limits.

`GET /projects/:projectKey/epics` returns epic issues, children, counts, point totals, progress, date bounds, and dependencies. Issue type matching uses the epic type/slug. The frontend route is `/projects/:projectKey/roadmap`.

The view prefers explicit epic dates and can use derived child bounds. For a single available endpoint, the display uses a 30-day provisional span. Resizing persists through the issue PATCH endpoint and requires `issues.update`. The read view is useful without edit permission.

### Source reference

Checked against source revision [`1b1b370`](https://github.com/jakwinkler/weaver/commit/1b1b3704c37b4d1ab09347508d57968e1de38130).

- [apps/web/src/features/boards/RoadmapView.tsx](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/web/src/features/boards/RoadmapView.tsx)
- [apps/web/src/features/boards/roadmapTimeline.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/web/src/features/boards/roadmapTimeline.ts)
- [apps/api/src/modules/issues/issues.service.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/api/src/modules/issues/issues.service.ts)
