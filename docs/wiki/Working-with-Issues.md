# Working with issues

An issue is one piece of work: a task, bug, story, or larger epic. Use its summary for the outcome, its description for the context, and its comments for the discussion. Edits made in a list, board, or detail page affect the same issue.

## Create and describe work

Open a project, choose **Issues**, then **Create Issue**. Start with a concrete summary and use **Description** to explain the problem, expected result, and any acceptance criteria. Use headings, lists, links, quotes, and code blocks when they make the content easier to follow. Leave **More options (optional)** alone unless you need planning fields; question-mark buttons explain them. Choose **Create**, then open the new issue from the list. Add screenshots or files through **Attachments** after creating the issue.

The editor supports formatted text and images. Paste or drop an image where supported, or use the image toolbar action. Use the issue's **Attachments** tab for supporting files. Attachment access still requires the relevant authorization; an attachment URL is not a public sharing link.

For an invited client who only needs to make requests and reply, see [Weaver for invited clients](https://github.com/jakwinkler/weaver/wiki/For-Invited-Clients).

## Edit without leaving the list

Click an editable summary, priority, status, assignee, or date. Text edits save with Enter or when you leave the field; Escape cancels. Select fields apply the chosen value. Tab and Shift+Tab move between editable cells.

On the detail page, use **Edit** for the issue form, **Edit description** for rich text, or **Add details** when the description is empty. Save or cancel that description explicitly. The side panel provides quick controls for status, priority, story points, assignee, and dates.

A failed save can restore the previous value and show an error. Reopen or refresh the issue to confirm a consequential change. Read-only users do not get the same edit controls.

## Change status

Choose the status control or move the card on a board. The project's workflow determines which transitions are allowed. Members with issue transition permission can see the project's readable status names and available next steps without workflow administration access. For example, the default workflow goes **To Do → In Progress → Done**, with **Reopen** returning Done to To Do. Jumping directly from To Do to Done is not an allowed transition in that workflow.

Status is separate from priority, story points, and the manual **% Done** field. Setting % Done to 100 does not substitute for moving the issue to a completed workflow status.

## Find and order issues

Use the search field in the header to find work across the accessible workspace. Inside an issue list, click a sortable column heading to change the sort direction. Pagination controls choose a page and 10, 25, 50, or 100 rows per page.

Use drag handles to arrange the manual issue order. Clear an explicit column sort before dragging: a list sorted by priority cannot also display your manual ordering. Search and list URLs preserve relevant query and paging state so you can return to the same view.

## Update several issues

1. Tick the issues you want to change. The header checkbox selects the current page, not every result on other pages.
2. Use Shift+click for a range, or `j`/`k` and `x` for keyboard selection.
3. Use the bulk toolbar to change status, assignee, priority, sprint, or labels.
4. Check the selected count and target value before applying the change.

A bulk operation accepts at most 100 issues. Status changes must be valid for all selected issues. For bulk labels, treat the supplied list as the replacement set, not an instruction to append one label.

Deletion asks for confirmation. Deleting an issue also removes related data; there is no general issue trash or undo flow documented here. Use status or labels when you only need to take work out of the current queue.

## Estimate work

Use **Story Points** on the detail page. The quick choices are 1, 2, 3, 5, 8, 13, and 21, and you can enter another whole number from 0 through 100. **Clear** means unestimated. Zero is an estimate of zero, not “unknown.” Boards and sprint summaries total these estimates.

Continue with [Collaboration and Notifications](https://github.com/jakwinkler/weaver/wiki/Collaboration-and-Notifications), [Sprints and Reports](https://github.com/jakwinkler/weaver/wiki/Sprints-and-Reports), or [Recurring Tasks](https://github.com/jakwinkler/weaver/wiki/Recurring-Tasks).

---

## Technical reference (developers and LLMs)

The guidance above covers everyday use. The details below explain API contracts, implementation, and operational limits.

| Operation | API route, after `/api/v1` |
| --- | --- |
| Create or list project issues | `POST /projects/:projectKey/issues`, `GET /projects/:projectKey/issues` |
| Read, update, delete | `GET`, `PATCH`, `DELETE /issues/:issueKey` |
| Workflow transition | `POST /issues/:issueKey/transition` |
| Manual order | `PATCH /issues/reorder` |
| Bulk update or delete | `PATCH /issues/bulk`, `DELETE /issues/bulk` |
| Assign a sprint or backlog | `PATCH /issues/:issueKey/sprint` |

Issue keys such as `WEB-3` are human identifiers. Bulk payloads use UUID `issueIds`. A bulk update has `{ "issueIds": ["<uuid>"], "updates": { "priority": "high" } }`; a bulk delete has only `issueIds`. These mutations enforce permissions and project access at the API boundary.

Descriptions and comment bodies use TipTap JSON. Legacy text is normalized for rendering. An issue description can be cleared with `null`. Story points are an integer from 0 to 100 or `null`. Date-only fields use `YYYY-MM-DD`.

The local inline help implementation extends pilot `ce5494a`: it sends Description in the existing create-issue payload, keeps optional planning fields in a disclosure, and adds accessible help for creation and comments. Uploads in the create editor are deferred until an issue exists so files have an issue access boundary. The updated creation instructions depend on deploying that frontend change; the immutable source links below describe its earlier baseline.

List edits and drag operations use optimistic client updates. Failed requests restore or invalidate cached data. WebSocket events refresh other open clients; the displayed state is not an offline synchronization guarantee.

The pilot release uses a project-scoped workflow summary for issue/list/board status controls. It also limits assignee choices for ordinary members to people who share an explicit project with them, plus themselves. Issue creation and updates reject hidden assignee IDs on the server.

### Source reference

Checked against source revision [`1b1b370`](https://github.com/jakwinkler/weaver/commit/1b1b3704c37b4d1ab09347508d57968e1de38130).

- [apps/web/src/features/issues/IssueListPage.tsx](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/web/src/features/issues/IssueListPage.tsx)
- [apps/web/src/features/issues/IssueDetailPage.tsx](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/web/src/features/issues/IssueDetailPage.tsx)
- [apps/api/src/modules/issues/issues.controller.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/api/src/modules/issues/issues.controller.ts)
- [apps/api/src/modules/issues/issues.service.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/api/src/modules/issues/issues.service.ts)
- [packages/shared/src/schemas/index.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/packages/shared/src/schemas/index.ts)

Pilot update checked against [`ce5494a`](https://github.com/jakwinkler/weaver/commit/ce5494a445f0a5412cf7e0be378308afbeb5e5f8): [issue list](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/apps/web/src/features/issues/IssueListPage.tsx), [project workflow route](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/apps/api/src/modules/projects/projects.controller.ts), and [client access browser checks](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/apps/web/e2e/invitations.spec.ts).
