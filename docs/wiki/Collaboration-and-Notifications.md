# Comments, mentions, and notifications

Use comments to keep decisions with the issue, and use an `@mention` when a particular teammate needs to respond. The notification bell collects in-app notifications. Email is an additional channel that depends on your preferences and the installation's mail configuration.

## Discuss an issue

Open an issue's **Comments** tab. Write the update, use the rich-text toolbar if needed, and choose **Comment**. Include the decision or requested action, not just “updated.” **All** combines activity for a wider view. **Logs** appears when the project's time-tracking feature is enabled.

To mention someone, type `@` and part of their name, then choose the person from the suggestions. Selecting a suggestion inserts an actual mention. Typing a person's name as plain text is not equivalent.

For ordinary members and viewers, suggestions show only themselves and people who share an explicit project with them. Owners and administrators can search the full organization directory. A mention only notifies someone who can read that project. Mentioning yourself does not create a self-notification. Editing a comment only notifies newly added mentions, which avoids repeatedly alerting the same people for every edit.

An unfinished comment is kept in this browser for that issue. After a comment is posted successfully, its draft is cleared so it does not reappear when the page reloads.

## Follow live changes

While a project or one of its issues is open, Weaver keeps a live connection to that project. When someone else creates, edits, moves, or deletes an issue, or comments on one, the issue list, board, backlog, sprint board, roadmap, and open issue refresh on their own. Sprint planning, the backlog, and sprint reports also refresh when someone creates, edits, starts, completes, or deletes a sprint. An issue's **Logs** tab refreshes when someone logs, edits, or deletes time on that issue. Updates from other people can show a small toast, including one that names a sprint someone else started or completed. Your own changes do not need a second notification toast.

The dashboard and search results do not refresh on their own.

This is live refresh of saved records, not simultaneous character-by-character editing. Coordinate before two people rewrite the same description. If an update appears stale, check the connection and refresh before making a conflicting edit.

## Choose which email you receive

Open your account menu and **Profile**. The email notification controls cover assignment, mentions, comments, and status changes. Turn off the categories you do not need and save the preferences. These switches control email; they do not disable every in-app notification.

Email links include an unsubscribe flow for the relevant notification preference. Changing one category should not be treated as unsubscribing from all communication.

## For administrators: enable email

Open **Administration → System Settings → Email**. Configure the SMTP server, port, credentials, sender name/address, and secure-connection option according to your mail provider. Use **Send Test Email**, then test an actual assignment or comment notification with a consenting recipient.

Tenant SMTP settings take precedence over system fallback settings. If email does not arrive, check the recipient preference, the intended recipient, the worker/queue health, and SMTP logs. A bell notification alone does not prove email delivery. No external email was sent during this documentation walkthrough.

---

## Technical reference (developers and LLMs)

The guidance above covers everyday use. The details below explain API contracts, implementation, and operational limits.

Mentions are TipTap nodes with `type: "mention"` and an `attrs.id` user UUID. User lookup uses `GET /users/search?q=<prefix>`. Comment creation/update extracts mention nodes and compares old and new sets.

The pilot release filters member search before the ten-person result limit and checks mention recipients against current project access. Comment submission cancels the pending local draft save after the server confirms the post.

The WebSocket namespace is `/ws`. Events include `event`, `data`, and `timestamp`, with actor IDs where available. Rooms are derived from authenticated tenant context; project rooms are tenant-scoped. Client query invalidation maps events to the relevant caches. Do not trust a caller-supplied tenant ID as authorization.

The web client sends `join:project` with `{ projectKey }` for the project in the current route (`/projects/:projectKey/...`, or the project part of `/issues/:issueKey`) once navigation settles, sends `leave:project` when the route moves to another project or out of projects, and joins again after each reconnect. The gateway allows 20 joins per connection every 10 seconds, 60 per user and 600 per tenant each minute, and answers `{ joined: false }` when it refuses one. It also refuses a join that arrives before it finishes authenticating a new connection, so the client waits briefly after connecting and retries refused joins with backoff. Sprint events (`sprint.created`, `sprint.updated`, `sprint.started`, `sprint.completed`, and `sprint.deleted`) carry `sprintId`, `projectId`, `projectKey`, the sprint `name`, and the acting `userId`. Completing or deleting a sprint also refreshes issue lists, board cards, and the backlog, because both move issues back to the backlog without issue events. Time events (`time.logged`, `time.updated`, and `time.deleted`) carry `issueKey` and `projectKey`, which route them to the issue's project room. The client does not map `issue.sprint_changed`; the same change also sends `issue.updated` and `issue.moved`. Adding issues through `POST /sprints/:id/issues` sends no event, so other sessions see those additions after a reload. The backlog and sprint board move issues with `PATCH /issues/:key/sprint` and `PATCH /issues/:key`, which do send issue events.

Notification preferences use `PATCH /users/me/notification-preferences` with `emailOnAssign`, `emailOnMention`, `emailOnComment`, and `emailOnStatusChange`. The email worker reads the notifications queue. SMTP configuration and templates live separately from the in-app notification service. Protect the unsubscribe signing secret and never publish raw tokens.

### Source reference

Checked against source revision [`1b1b370`](https://github.com/jakwinkler/weaver/commit/1b1b3704c37b4d1ab09347508d57968e1de38130).

- [apps/api/src/modules/notifications/notifications.service.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/api/src/modules/notifications/notifications.service.ts)
- [apps/api/src/modules/comments/comments.service.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/api/src/modules/comments/comments.service.ts)
- [apps/web/src/hooks/useWebSocket.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/web/src/hooks/useWebSocket.ts)
- [apps/web/src/features/profile/ProfilePage.tsx](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/web/src/features/profile/ProfilePage.tsx)
- [apps/web/src/features/settings/SystemSettingsPage.tsx](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/web/src/features/settings/SystemSettingsPage.tsx)
- [apps/worker/src/processors/notifications.processor.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/worker/src/processors/notifications.processor.ts)

Pilot update checked against [`ce5494a`](https://github.com/jakwinkler/weaver/commit/ce5494a445f0a5412cf7e0be378308afbeb5e5f8): [comment editor](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/apps/web/src/features/issues/CommentsSection.tsx), [member visibility service](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/apps/api/src/core/tenant/member-visibility.service.ts), and [privacy browser check](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/apps/web/e2e/privacy.spec.ts).
