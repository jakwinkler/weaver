# Troubleshooting

Start with the exact page, action, and error. Confirm the organization and project before retrying a write. If a change may already have succeeded, read the current record first so the retry does not create duplicates.

| Symptom | First checks |
| --- | --- |
| An invitation link says it is invalid, expired, or already used | Ask the sender for a new private link; invitations expire after seven days and work once |
| An existing external-sign-in account cannot accept an invitation | The current form requires a Weaver password; contact the team before trying another link |
| You forgot your password | Choose **Forgot password?** on the sign-in page. The emailed link works once and expires after 30 minutes |
| Every browser and device asks you to sign in at the same time | The account's password was reset, which ends every session at once, and Weaver emailed the account about it. If you didn't reset it, reset the password again now |
| No reset email arrives | Check spam and the spelling of the address. Accounts that only use Google, GitHub, or SSO get an email about signing in instead. Operators: the API and worker both need `SMTP_HOST` and `SMTP_FROM`; organization mail settings are never used for resets |
| A reset link says it is invalid, expired, or already used | Request a new link. Each link works once, expires after 30 minutes, and a newer request cancels it |
| Sign-in or a reset request says to wait | Weaver limits repeated attempts from one address and for one account; wait the time shown |
| **Continue with Google** asks you to create an organization | No Weaver account used that email, so Weaver created one. To join an existing team, use its invitation link instead |
| **Continue with Google** says to sign in another way | Your organizations turned that provider off; use your password or the organization's SSO link |
| A joined client cannot see the expected project | Check the selected organization and ask the team to add the client to that private project |
| A client can read issues but cannot create or comment | Check both the organization role and project role; viewers cannot write |
| A project or issue is missing | Correct organization, private-project membership, filters, and pagination |
| Edit or administration controls are absent | Role permissions and project access |
| Board, sprint, calendar, or Gantt view is missing | Tenant plugin installation/enablement and project feature settings |
| A card returns to its previous column | Allowed workflow transition and save error |
| Manual row dragging is unavailable | Clear explicit column sorting; check edit permission |
| WIP limit is exceeded | Limits are warnings; they do not block moves |
| A sprint cannot start | Another sprint may already be active in this project |
| Unfinished issues disappeared from a completed sprint | They return to the backlog on completion |
| An issue list seems incomplete | Check the selected project, page size, and filters |
| Email does not arrive | Recipient preference, SMTP configuration, worker/queue, and provider delivery |
| Live updates stop | Connection/session state; refresh before editing stale data |
| A form rejects a request | Required field/mapping, inactive form, rate limit, or CAPTCHA |
| An API client gets 401 | Missing, expired, revoked, or wrong-tenant credentials |
| An API client gets 403 | Scope, role permission, or project membership |
| An API client gets 429 | Back off and reduce request rate |
| An API key request gets 503 | Rate limiting needs Redis; retry after service recovery |
| A scheduled rule does nothing | Enabled state, UTC schedule, matching issues, worker and Redis health; narrow conditions if more than 100 issues match |
| OAuth returns 503 | Provider credentials missing in the running API |
| API proxy returns 502 after container recreation | API health and proxy resolution of the new container address |

## Known limitations observed during documentation

The local source walkthrough found that some board/backlog assignee labels show an ID fallback. The pilot release corrected the main sprint board's date-only display, but the backlog's sprint container can still show the previous day west of UTC. The [sprint guide](https://github.com/jakwinkler/weaver/wiki/Sprints-and-Reports) and [board guide](https://github.com/jakwinkler/weaver/wiki/Boards-and-Views) explain the implications.

The September walkthrough found the **Plugins** management page blank after installing the example plugin set. PR #21 fixed the cause in [`5d20a39`](https://github.com/jakwinkler/weaver/commit/5d20a39c472c0885ba5658d59ef26e7543857ba5): the page expected settings that the installed-plugin list leaves out. If the page is still blank, confirm the installation runs a revision that includes that commit, and preserve browser errors and the installed plugin list for diagnosis. Do not uninstall data-bearing plugins just to make the page render.

External OAuth/SSO exchanges, SMTP delivery, a real Jira migration, native companion capture/pairing, overnight recurrence, and a production deployment were not verified in the September documentation walkthrough. The later [pilot readiness report](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/apps/web/e2e/READINESS-2026-10-14.md) records separate local and live client checks with their own limits.

## Report a reproducible problem

Include the installed revision, browser, page, expected result, actual result, and a short sequence using fictional data if possible. For an operator issue, add relevant service health and sanitized error excerpts. Never include cookies, bearer tokens, passwords, private attachment URLs, or a full environment dump.

If the problem only affects one role, say which role and whether the project is private. If it only affects a plugin, include the plugin ID/version and whether the server asset and actual browser screen work.

---

## Technical reference (developers and LLMs)

The guidance above covers everyday use. The details below explain API contracts, implementation, and operational limits.

Use API logs for rejected requests, browser console/network diagnostics for UI failures, and worker/queue diagnostics for background work. Record the exact application/plugin revision before changing anything.

For a missing reset email, the API logs `Password reset completed for user <id>` after a reset and warns when `SMTP_HOST` or `SMTP_FROM` is missing. The worker logs `[account-mail] Sent <template> email to user <id>` from the `account-mail` queue, and refuses an SMTP host on a private or loopback address unless `SMTP_ALLOW_PRIVATE_HOST=true`. Neither process logs the link or the email address, and finished account-mail jobs are removed from Redis.

The deployment health endpoint is `/api/v1/health`. It checks a narrow health surface, not every provider or feature. A complete recovery check must repeat the original failed action and verify its saved result.

Do not change `NODE_ENV` to development or enable schema synchronization on a production database as a repair shortcut. Do not clear persistent volumes or uninstall plugins until their data implications and recovery path are understood.

### Source reference

Checked against source revision [`1b1b370`](https://github.com/jakwinkler/weaver/commit/1b1b3704c37b4d1ab09347508d57968e1de38130).

- [apps/api/src/health.controller.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/api/src/health.controller.ts)
- [apps/web/src/features/settings/PluginsPage.tsx](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/web/src/features/settings/PluginsPage.tsx)
- [apps/web/src/features/boards/SprintContainer.tsx](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/web/src/features/boards/SprintContainer.tsx)
- [apps/api/src/core/database/database.module.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/api/src/core/database/database.module.ts)

Pilot troubleshooting updates checked against [`ce5494a`](https://github.com/jakwinkler/weaver/commit/ce5494a445f0a5412cf7e0be378308afbeb5e5f8): [invitation page](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/apps/web/src/features/auth/InvitationPage.tsx), [access policy](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/docs/security/project-directory-privacy.md), [sprint container](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/apps/web/src/features/boards/SprintContainer.tsx), [API key guard](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/apps/api/src/core/auth/api-key-rate-limit.guard.ts), and [automation engine](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/apps/api/src/modules/automations/automation-engine.service.ts).
