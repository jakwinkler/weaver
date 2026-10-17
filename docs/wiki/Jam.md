# Turn Jam bug reports into Weaver issues

The Jam plugin connects one [Jam](https://jam.dev) workspace to your Weaver organization. A Jam captured in that workspace reaches Weaver within seconds. Routing rules can turn it into an issue in the right project straight away; otherwise it waits in a triage inbox, so nothing is silently dropped. Each linked Jam shows on its issue with where, how, and by whom it was captured. From any issue you can also send a recording link, and a Jam recorded through it, even by someone without a Jam account, lands back on that issue.

Weaver comments on each linked Jam with the issue's key and link, so people in Jam can see where the report is tracked.

## Set it up (an administrator, once)

Weaver must be reachable at a public HTTPS address, because Jam does not deliver webhooks to `localhost` or plain `http`. The API needs `API_PUBLIC_URL` and `WEB_URL` set to the public addresses. In production, add `@weaver/plugin-jam` to `WEAVER_TRUSTED_PLUGINS`.

1. In **Administration → Plugins**, install **Jam**. It installs disabled; enable it.
2. In Jam, create a personal access token (workspace menu, **Settings → MCP → Personal access token**) with the `mcp:read` and `mcp:write` scopes. Comments the plugin posts on Jams appear as the person who owns this token. Note its expiry date.
3. Copy your Jam workspace ID from the address of any Jam settings page (`jam.dev/s/<workspace ID>/settings`), and copy a reusable recording link from Jam.
4. Open the Jam plugin's settings and enter the workspace ID, the token, its expiry date (`YYYY-MM-DD`), and the recording link. Choose whether to embed Jam's player and whether to comment on Jams when issues are resolved.
5. Open **Apps → Jam → Connection** and copy the webhook URL. In Jam, add a webhook endpoint with that URL for the `jam.created` event, then copy its signing secret (it starts with `whsec_`) into the plugin's **Webhook signing secret** setting.
6. Choose **Verify connection**. Every row except **Last webhook** should turn green; that one turns green when the first Jam arrives. **Access token** stays amber while the token expires within 14 days.
7. In **Administration → Roles & Permissions**, grant **View Jams**, **Link Jams**, and **Triage Jams** to the roles that need them, and keep **Administer Jam** for whoever manages the connection and rules.

## Everyday use

**Inbox.** **Apps → Jam → Inbox** lists new Jams with their title, type, page, reporter, and browser. Choose **Create issue**, pick a project, and adjust the summary, type, priority, and labels. The issue's description gets a **Jam** section with an **Open in Jam** link and the capture details. The reporter is the person who captured the Jam when they can create issues in that project; otherwise it is you. You can also **Attach** a Jam to an existing issue by key, **Dismiss** it (and restore it later), or choose **Sync from Jam** to bring in Jams from the last seven days that Weaver missed. Synced Jams have no page or thumbnail.

**On an issue.** The **Jams** section shows each linked Jam with its thumbnail. **Summary** shows console and network counts, up to five console errors, and up to five failed requests; it never shows request bodies, headers, or query strings. **Play** opens Jam's player inside the issue when the administrator turned it on and the Jam is shared with anyone who has the link. Paste a Jam link and choose **Attach** to link another Jam. **Unlink** returns the Jam to the inbox when no other issue links it.

**Recording requests.** Under **Recording requests**, choose **Request a recording**, then **Create and copy link**, and send the link to whoever can reproduce the problem. Their Jam appears on the issue as "Recorded for a request", the issue gets a comment, and the request counts it. **Revoke** stops a link; Jams recorded through it afterwards go to the inbox marked as coming from a revoked request.

**Rules.** In **Apps → Jam → Rules**, administrators route Jams by the page host they were captured on, optionally narrowed by a path prefix such as `/checkout`. A rule either creates an issue at once, with its own priority and labels, or suggests a project in the inbox. The first matching rule wins, rules can be reordered or turned off, and a host can belong to only one project unless the rules use different paths. A rule can create up to 20 issues an hour by default.

**Resolving.** If the administrator turned it on, moving an issue with a linked Jam to a done status adds a comment on the Jam, mentioning whoever captured it.

## Access and limits

- Project access still applies: someone who is not a member of a project sees no Jams on its issues, and a project viewer can read Jams and summaries but cannot attach, unlink, request, or revoke.
- Anyone with **Triage Jams** sees every Jam in the inbox, whatever its project.
- Video is never stored in Weaver. Thumbnails load from Jam's media host, and anyone with a thumbnail's address can open it.
- The debug summary is fetched with the plugin's token, so anyone who can read the issue sees it, even without a Jam account. It is cached for an hour.
- An issue created by a rule is filed as the Jam's author when that person can report in the project, and otherwise as whoever last saved the rule.
- A failed comment on a Jam is retried when an administrator verifies the connection or retries Jam comments, and when the next Jam is linked, not on a timer.
- Jams recorded through a recording link have no page address unless your Jam workspace has a connected domain, so page-host rules do not match them.
- One Jam workspace per organization. People do not sign in to Jam individually, and relinking Jams after a Jira import is not available yet.
- The Jam token and webhook secret are plugin settings: masked in Weaver, but stored unencrypted in the database.

---

## Technical reference (developers and LLMs)

The guidance above covers everyday use. The details below explain the plugin's contracts and limits.

`@weaver/plugin-jam` (version 0.2.0) is a tenant-scoped app plugin that installs disabled. Its manifest declares the permissions `jam.view`, `jam.link`, `jam.triage`, and `jam.admin`; the settings `jamWorkspaceId`, `jamApiToken`, `jamAccessExpiresOn`, `jamWebhookSecret`, `recordingLinkUrl`, `postBacklinkComments`, `showDebugSummary`, `embedPlayer`, `notifyJamOnResolve`, and `autoCreateHourlyLimit`; a page and navigation entry at `/apps/jam`; and an `issue-detail-content` slot. Jam delivers `jam.created` webhooks to the public route `POST /api/v1/plugin-routes/@weaver~plugin-jam/webhook/:tenantId`, which verifies the Standard Webhooks (Svix) signature with the `whsec_` secret. Its tables come from the plugin's SQL migrations.

Creating issues and comments from a webhook, where there is no request user, uses the core plugin API added for integrations: the `issue-create` capability with `context.api.issues.create` (reporter named with `reporterId`, who must hold `issues.create` and project write access) and `issues.addComment` with an explicit actor. Both run through the same services as the HTTP routes, so workflows, validation, events, and notifications apply. See the [plugin API reference](https://github.com/jakwinkler/weaver/blob/main/docs/plugin-api-reference.md).

The design, Jam behavior sources, and phase notes are in the [Jam roadmap](https://github.com/jakwinkler/weaver/blob/main/docs/roadmap/30-jam-plugin.md), and the human test plan is in the [Jam test guide](https://github.com/jakwinkler/weaver/blob/main/docs/roadmap/30-jam-plugin-testing.md). Automated coverage is in `apps/api/test/jam-plugin.e2e-spec.ts` and `apps/api/test/plugin-integration-prerequisites.e2e-spec.ts`.
