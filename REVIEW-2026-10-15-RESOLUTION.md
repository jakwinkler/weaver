# October 15 review resolution

The October 15 review audited `3acd461` on `bugs-security-enhancements`, a branch 104 commits behind main. Every finding was re-checked against `integration/password-reset-and-fixes` (main `d6c641d` plus the October 15 branches) before any change. Most findings were already fixed on main. The remaining ones are fixed on this branch or recorded below as accepted or deferred. Verification covers local builds and tests; production rollout and acceptance remain separate steps.

## Implemented

| Findings | Result | Commits |
| --- | --- | --- |
| P3 | The worker records webhook deliveries in the tenant schema. Before, the unqualified insert failed after every successful POST, so BullMQ redelivered each event up to five times, nothing reached delivery history, and failing endpoints were never switched off. A failure to record a delivery after a successful POST is now logged instead of retried. Each delivery carries an `X-Webhook-Delivery` id that stays the same across retries, so receivers can drop duplicates. | `3070a23` |
| A5 | Changing an issue's status through `PATCH /issues/:key` or bulk update requires `issues.transition`, and setting, changing, or clearing an assignee (including on create) requires `issues.assign`. Unchanged values are allowed. Owners, administrators, and the seeded member role keep working; custom roles need both permissions. | `f131cfc` |
| D1, D2, D6 | Administrators can list pending invitations and revoke one (`GET` and `DELETE /api/v1/users/invitations`), and the Users page shows them with a Revoke button and copy explaining that the link works for whoever has it until it is used, revoked, or expires. Re-inviting an email replaces its pending link. Revoked and replaced links answer like unknown tokens. Expired or accepted invitations older than 30 days are deleted when a new one is created. | `c47c1f1`, `e427970` |
| D3 | The bundled nginx keeps `/invite/` and `/api/v1/auth/invitations/` out of its access log and sends `Referrer-Policy: no-referrer` for them, as it already did for password reset links. | `8af26fc` |
| D4 | Invitation lookup and acceptance use the per-IP auth rate limit and fail closed when Redis is unavailable. | `287247a` |
| P9 | Time Reports grouped by user works (it joined the tenant `users` table, which does not exist). Rows show display names, never email addresses. | `4947d56` |
| P10 | Routes of a project-scoped plugin require the plugin to be enabled for the project resolved from the route. Public routes are unchanged, so they cannot be used to probe project keys. No bundled project-scoped plugin has server routes today. | `9361a03` |
| P11 | `docker/docker-compose.yml` passes `WEAVER_TRUSTED_PLUGINS` to the API, as the Compose template already did. | `43e54b0` |
| P17, W2 | Both CSV exporters also prefix cells that start with a tab or carriage return. | `d861ac2`, `b3f6cb3` |
| A11 | Updates that set or clear a parent or epic take a transaction-scoped advisory lock for the project before the cycle check, so two concurrent edits can no longer form a cycle. | `ba9ede5` |
| Health bypass (found in triage) | Only the exact health endpoint skips rate limiting. Before, any path ending in `/health`, including plugin routes, did. | `287247a` |
| Automatic Time (found in triage) | Offline drafts and draft assignment check that the user can read a supplied issue key, and answer the same way for hidden and missing issues. | `4eef878` |
| W3 | Backlog sprint dates show the stored calendar day in every time zone. | `58c2b87` |
| W6 | Live updates no longer wipe an open issue edit form. If someone else changes the summary, priority, or labels meanwhile, a notice says saving will replace their changes. Drafts no longer carry over to another issue. | `770022e` |
| W7 | A failed inline edit reverts only that field, and inline edits work after visiting the roadmap. | `c371e64` |
| W9 | Requests queued during a token refresh are marked as retried, so a persistent 401 causes one refresh call, not one per request. | `2e67a7f` |
| W13, W15, W16a, W18 | Teams without a date omit it; search results link to their issues; plugin pages match whole path segments; logout clears saved workflow layouts and the followed Jira import. | `025c6a8`, `35a6b24`, `b1f279e`, `b7e72eb`, `5a0281f` |
| Live update load (found in triage) | Live updates invalidate each query once per 250 ms burst instead of once per event, so a burst no longer triggers repeated full refetches of every page. | `e545b3b` |
| Tenant slug (merge) | The joined membership query introduced with session versions selects the tenant slug again, so plugin contexts keep the slug added in `05028f2`. | `7dd8ff8` |
| A3, A7, A9, W5 | Regression tests now cover fail-closed rate limiting on auth routes, the dummy password hash for unknown emails, authentication on public plugin routes that declare permissions, and shortcuts ignoring modified key presses. | `b89f3a2`, `0207652` |

## Already fixed before this work

A1, A2/S-H4, A3, A4/P8, A6, A7, A9, A10, A12, M3, M4, M7, L6, L12, S-H3/P1, P2, P4, P7, P12, P14, P18, P19, S-H5, W1, W2, W4, W5, W8, W10, W11, W12, and W14 were already fixed on main through the September fixes and later work. The triage confirmed each in the current code. W1's component is not mounted, and the server still stores provider URLs as received; any future rendering must keep the existing protocol check.

## Rollout and compatibility

- Deploy the API, web, and worker together. The worker change is what makes webhook history and the delivery header appear.
- Custom roles that grant `issues.update` without `issues.transition` or `issues.assign` lose the ability to change status or assignee through issue edits. Review custom roles before deploying.
- Webhook receivers can start using `X-Webhook-Delivery` to discard retries. The id comes from the queue and can repeat if Redis is reset; it is not part of the signature.
- Invitations need no database change. Existing pending links keep working until used, revoked, replaced, or expired.
- Operators of a reverse proxy in front of the bundled nginx should also keep `/invite/`, `/api/v1/auth/invitations/`, and `/reset-password/` out of its logs.
- Production Compose deployments must set `WEAVER_TRUSTED_PLUGINS`, or the API loads no plugins.

## Accepted or deferred

- **S-H1/M6, A9 context:** Public plugin routes still take the tenant from the URL. The bundled forge receivers verify signatures and fail closed. A per-tenant opaque webhook path or host-side verification is design work. The companion pairing routes take the tenant from a header in the same way.
- **S-H2/P5:** One database role serves every schema, and plugin SQL is not confined. Plugins are documented as trusted host code. Per-tenant roles are architectural work.
- **P6:** Plugin secret settings are masked in responses but stored as plaintext. Encrypting them needs a key, a backfill, and rotation; planned separately.
- **P13, P15, P16:** Plugin trust is an ID allowlist without hashes; Kubernetes images use `:latest` and production overlays ship an empty plugin list; plugin permissions are not granted to roles on install. These are operator and product decisions.
- **D1 (rest):** Invitation links remain bearer links shared by an administrator. Sending them by email, or verifying email ownership at acceptance, would make invitations depend on mail configuration; that is a product decision.
- **S-B1, D5:** A fresh production database still needs a reviewed schema plan, and projects without feature rows need a one-time backfill.
- **A8/L4, L2, L3, L7, L8 to L11:** Unchanged from the September 24 decisions. A13 (sprint start and completion use the UTC date, not the tenant's time zone) is deferred with them.
- **W16b/c, W17:** Plugin browser code runs with the viewer's session, client permission checks are presentation only, and cross-site request protection relies on SameSite cookies and the CORS allowlist. Keep the web app and API same-site.
- **Plugin core API helpers:** `api.issues.get` and similar helpers do not check project access for keys other than the route's. Plugins must call `assertAccess` or `accessibleIds`, as the bundled ones now do. Checking access by default is planned.
- **Minor:** date inputs on the issue page save on each change; a concurrent delete of one attachment can answer 500 instead of 404; webhook creation echoes a caller-supplied secret.
