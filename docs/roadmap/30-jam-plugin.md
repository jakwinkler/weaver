# Jam Integration Plugin

> Bring Jam bug reports into Weaver as triaged issues, and let a Weaver issue ask anyone for a Jam recording that lands back on that issue.

## Status

**Status: specification; Phase 0 spikes run October 16, 2026 ([results](#phase-0-results)); Phases 1 to 4 and the Phase 5 resolve comment implemented ([Phase 2 notes](#phase-2-implementation-notes), [Phases 3 to 5 notes](#phases-3-to-5-implementation-notes)).** Written October 16, 2026 against main `5db1948`. The rest of Phase 5 is not implemented. Statements about Jam are sourced in [Sources](#sources) and were checked on October 16, 2026; Jam ships often, so recheck them before each phase.

- First tenant: an agency pilot installation of Weaver, connected to the agency's own Jam workspace.
- Distribution: bundled first-party plugin, `@weaver/plugin-jam`, disabled on installation.
- Human testing: [test guide](30-jam-plugin-testing.md).
- Prerequisites: three small core SDK changes ([Weaver prerequisites](#weaver-prerequisites)). Phase 0 is done except the S4 seven-day recheck and the S6 Team-only case.

## Outcome

A bug captured with Jam should become actionable Weaver work without anyone copying links between tools, and a Weaver issue that needs a reproduction should be able to ask for one with a single link.

Success looks like this:

1. A Jam captured in the connected Jam workspace reaches Weaver within seconds. It either becomes an issue in the right project, by rule, or waits in a triage inbox. It is never silently dropped.
2. Every linked Jam is visible on its Weaver issue: what was captured, where, on what browser and OS, by whom, plus a live debug summary (console errors and failed requests) pulled from Jam on demand.
3. From any issue, a user can generate a recording link. Whoever records through it, including a client with no Jam account, produces a Jam that attaches itself to that issue.
4. The Jam shows where it is tracked: Weaver posts a comment on the Jam with the issue link.

## The Jira integration, and what carries over

Jam's Jira integration is the model the request points to. What it actually does:

| Jam to Jira behavior (verified)                                                                                       | Weaver equivalent in this spec                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reporter picks Jira as the destination inside the Jam extension and fills project, issue type, priority, labels       | Not possible: Jam owns the extension's destination list, and Weaver is not on it. Replaced by routing rules plus a triage inbox with the same field picker in Weaver. |
| "Send to App" sends an existing Jam to Jira                                                                           | **Attach Jam** on an issue (paste a Jam URL) and **Create issue** from the inbox                                                                                      |
| Ticket carries the Jam link, page URL, timestamp, country, device, OS, browser, viewport, and network speed           | Same fields in the issue description template, from the `jam.created` payload                                                                                         |
| Console logs and network requests are linked from the ticket, not copied into it (inferred from Jam's GitHub tickets) | Live debug summary in the issue's Jam panel, fetched through Jam's MCP server; nothing copied by default                                                              |
| One Jira site per Jam workspace; connection made by one user's OAuth grant                                            | One Jam workspace per Weaver tenant; connection made with one Jam personal access token                                                                               |
| Jam records the linked ticket on the Jam (`integrations`, searchable by key)                                          | Weaver cannot write that field. It posts a backlink comment on the Jam instead.                                                                                       |
| No status or comment sync back from Jira                                                                              | Optional resolve comment on the Jam when the Weaver issue reaches a done status (Phase 5)                                                                             |

Two Weaver-only capabilities go beyond Jira parity because Weaver owns the tracker:

- **Request a recording from an issue.** Jam's recording links accept a reference that comes back on the resulting `jam.created` webhook. Weaver signs that reference, so the Jam attaches itself to the issue that asked for it.
- **Relink Jams after a Jira migration.** Jam keeps Jira keys on Jams that were sent to Jira, and Weaver's Jira import keeps source keys. A tenant that migrated can move those Jam links onto the imported issues (Phase 5, optional).

## Jam's integration surface

Jam has **no public REST or GraphQL API**. Everything below comes from documented surfaces.

| Surface                | What it provides                                                                                                                                                                                                                                                                                                                                                                                                              | Constraints that shape this design                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Webhooks (Svix)        | `jam.created` per workspace. `recording_link.created` is documented but was not offered in the pilot workspace's event catalog. Payload includes jam ID and URL, team ID, type, title, origin, author email and name, media URLs, system info, description and page URL (both absent on recording-link Jams without a connected domain), and `recordingLink` (`publicId`, the link name as `description`, `reference`) | Standard Webhooks signature (`svix-id`, `svix-timestamp`, `svix-signature`, `whsec_` secret). Endpoint must be public HTTPS, not localhost. Retries: immediately, 5s, 5m, 30m, 2h, 5h, 10h, 10h. Event name is not sent as a header. No folder in the payload.                                                                                                                          |
| MCP server             | `https://mcp.jam.dev/mcp`, streamable HTTP, JSON-RPC. Read: `getDetails`, `getConsoleLogs`, `getNetworkRequests`, `getMetadata`, `searchJams`, and more. Write: `createComment`, `updateJam`, recording link management                                                                                                                                                                                                       | This is the only programmatic read and write path. Every response is `text/event-stream`; a JSON-only `Accept` gets `406`. No session affinity is needed. Calls took 200 to 370 ms in the spike, with no rate-limit headers. Tool output is designed for AI agents and is not a versioned API contract, except `searchJams`, which takes `v: 1`. Some tools send data to Google Gemini. |
| Personal access tokens | `jam_pat_...` Bearer tokens for the MCP server                                                                                                                                                                                                                                                                                                                                                                                | One user and one workspace per token. Mandatory expiry: 7, 30, or 90 days, or 1 year. Scopes `mcp:read` and `mcp:write`. Every call acts as that user. No client-credentials grant.                                                                                                                                                                                                     |
| Recording links        | `recorder.jam.dev/<publicId>`: anyone records without a Jam account. URL parameters `jam-title`, `jam-folder`, `jam-reference`, `jam-mic-enabled`                                                                                                                                                                                                                                                                             | Team plan: 150 links per month. Console and network logs only when recording starts from a verified connected domain. A `jam-reference` URL parameter reaches the webhook as `recordingLink.reference` (S2), but nothing exposes it afterwards: `searchJams` matches only a link's own reference, and `getDetails` omits it.                                                            |
| `jam.metadata()` SDK   | App-defined key/value context captured with each Jam, read back through `getMetadata`                                                                                                                                                                                                                                                                                                                                         | Only for sites the team controls. Useful later for Weaver's own UI.                                                                                                                                                                                                                                                                                                                     |
| oEmbed                 | `https://jam.dev/oembed?url=...` returns an iframe of `https://jam.dev/mini/<id>`                                                                                                                                                                                                                                                                                                                                             | Renders fully for signed-out viewers of Jams shared with anyone who has the link (S6); Team-only Jams untested. Weaver's web CSP has no `frame-src` allowance today.                                                                                                                                                                                                                    |

Plan gating (Jam pricing page, October 15, 2026): webhooks, MCP, issue trackers, and custom logs are on every plan. Recording links are limited to 5 per month on Free and 150 on Team. Private Jams and folders need Team.

## Weaver's plugin surface: what exists and what is missing

What the plugin can use as is:

- Public webhook routes with `:tenantId`, raw body access (`req.rawBody`), and seven-day replay protection (`context.webhooks.processOnce`). The GitHub, GitLab, and Bitbucket plugins already use this pattern.
- Plugin-owned tables through versioned migrations, plugin settings with secret masking (keys matching `token` or `secret` are masked in API responses by `redactSettingsSecrets`), declared permissions, the `issue-detail-content` and `issue-detail-sidebar` slots, an `/apps/<slug>` page, and the `issue.status_changed` event.
- `context.http` with safe redirects, a 30 second default timeout, and a 1 MB response cap.
- `context.api.issues.assertAccess`, `context.api.projects.accessibleIds`, and `context.api.activityLog.create`.

### Weaver prerequisites

| ID  | Gap (verified in source)                                                                                                                                                                                                           | Required change                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1  | Plugins cannot create issues. `PluginCoreApi.issues` has `get`, `update`, `addComment`, `assertAccess`, and `findCandidates` only.                                                                                                 | Add an `issue-create` core capability: `context.api.issues.create(projectKey, dto, { reporterId })` that calls `IssuesService.create`, the same path `FormsService.submitPublicForm` uses, so workflow initial status, custom field validation, `issue.created`, activity, and notifications all apply. Declared through `requires.coreCapabilities`; add the value to `PluginCoreCapability` (SDK) and to `packages/shared/src/schemas/plugin-manifest.ts`. |
| P2  | `issues.addComment` inserts straight into `comments` with `author_id = user?.id`. `comments.author_id` is non-nullable, so a comment from a webhook route (no user) fails, and no path emits `comment.added` or notifies mentions. | Route `addComment` through `CommentsService` and accept an explicit actor for background calls: `addComment(key, body, { authorId })`. The actor must be an active user with write access to the project.                                                                                                                                                                                                                                                    |
| P3  | `context.http` parses the body as JSON and returns `data: null` for anything else.                                                                                                                                                 | Required. S1 confirmed every Jam MCP response is `text/event-stream`, so `data` was `null` on every call. Add `responseType: 'text'` to `RequestOptions`, keeping the 1 MB cap and redirect checks; the adapter parses the SSE `data:` lines.                                                                                                                                                                                                                |

Not required for this plugin: a plugin job scheduler. Side effects that can fail (backlink comments, summaries) use a small retry queue that drains on later requests (see [Operations](#operations-and-failure-handling)).

## Proposed decisions

These are the defaults this spec assumes. Each one is reversible before Phase 2 ships.

| ID  | Decision                          | Default                                                                                                                                                                                                                                                                           | Alternative                                                                                                                                        |
| --- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Copy Jam debug data into Weaver?  | No. The description carries capture metadata and the Jam link; console and network data stay in Jam and appear as a live summary. Matches what Jam's own tracker tickets do.                                                                                                      | Snapshot the top console errors into the description (persists data Jam may later delete or blur)                                                  |
| D2  | Jams that match no rule           | Go to the triage inbox                                                                                                                                                                                                                                                            | Auto-create in a default project                                                                                                                   |
| D3  | Whose Jam identity the token uses | A dedicated Jam member for Weaver, so backlink comments and recording links are clearly attributed and survive a person leaving. It may need a paid Creator seat.                                                                                                                 | An admin's own Jam account (no extra seat; comments appear as that person)                                                                         |
| D4  | Plugin scope                      | `tenant`. One Jam connection per tenant; routing rules choose projects.                                                                                                                                                                                                           | `project`, which hides the panel in projects that never use Jam but complicates webhook routing                                                    |
| D5  | Request-a-recording mechanism     | One reusable recording link plus a signed `jam-reference` URL parameter per request. Costs no recording-link quota. S2 confirmed the reference reaches the webhook. It is webhook-only, so a delivery lost past Svix's retries and portal replay cannot be matched automatically. | A Jam recording link per request through `createRecordingLink` (150 per month on Team). Searchable by reference in Jam (S2), at the cost of quota. |
| D6  | Webhook versus polling            | Webhooks. A **Sync from Jam** button covers tenants without a public URL and backfills missed Jams into the inbox. Synced Jams carry no page URL, media, or recording reference (S5), so Sync cannot route by host or match recording requests.                                   | Polling only                                                                                                                                       |

## Ownership boundaries

| Boundary             | Owns                                                                                                                                                 |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Jam                  | Recordings, screenshots, console and network logs, blurring and sanitizing, Jam comments, recording link quotas, who can open a Jam link             |
| Weaver core          | Issues, comments, reporters, workflow, permissions, notifications, activity, audit                                                                   |
| `@weaver/plugin-jam` | Jam connection, webhook verification, Jam snapshots, Jam-to-issue links, triage inbox, routing rules, recording requests, debug summaries, backlinks |

The plugin never stores Jam media, console logs, or network bodies.

## User workflows

### W1. Connect (tenant admin, `jam.admin`)

1. In Jam: create a personal access token with `mcp:read` and `mcp:write` for the Weaver Jam member (D3), and note its expiry. Copy the workspace ID from the Jam settings URL (`jam.dev/s/<workspace-id>/settings`).
2. In Weaver: install and enable the plugin, then fill the settings form: token, token expiry date, workspace ID.
3. Open **Apps > Jam > Connection**. Weaver shows its webhook URL: `<API_PUBLIC_URL>/api/v1/plugin-routes/@weaver~plugin-jam/webhook/<tenant-id>`.
4. In Jam: **Settings > Webhooks > Set up** opens the Svix portal. Add the endpoint, subscribe to `jam.created`, and copy the `whsec_` signing secret into Weaver's settings.
5. Click **Verify**. Weaver checks the token (one read tool call), confirms the workspace, and shows the time of the last verified webhook once one arrives.

### W2. Jam arrives (no user action)

1. Jam POSTs `jam.created`. Weaver verifies the signature and timestamp, checks `teamId` against the connected workspace, and stores a snapshot.
2. Routing, in order:
   1. A valid Weaver recording reference attaches the Jam to that issue (W5).
   2. Otherwise the first enabled rule whose matchers all match decides: **create** an issue in its project with its defaults, or put it in the **inbox** with that project suggested.
   3. Otherwise the Jam goes to the inbox with no suggestion.
3. A created or attached link queues a backlink comment on the Jam: `Tracked in Weaver as WEB-123: <issue URL>`. The comment includes no issue title.

### W3. Triage inbox (`jam.triage`)

**Apps > Jam > Inbox** lists unlinked Jams, newest first: thumbnail, title, page host, reporter, origin, age, and the suggested project. Actions:

- **Create issue** opens the Jira-style picker: project, issue type, priority, labels, assignee, and a summary prefilled from the Jam title. The description preview shows the template below. The user needs write access to the chosen project.
- **Attach to issue** links the Jam to an existing issue by key.
- **Dismiss** hides it, with an undo filter.

The reporter on a created issue is the Weaver user whose email matches the Jam author, if that user is active and can write to the project. Otherwise it is the person triaging. Weaver never creates users from Jam authors.

### W4. Issue panel (`jam.view`)

The `issue-detail-content` slot shows a **Jams** section when the issue has linked Jams, or when the viewer has `jam.link`.

- Each card shows the thumbnail, title, type, page URL, browser and OS, viewport, reporter, capture time, link source, and **Open in Jam**. The card renders from the stored snapshot with no Jam call.
- **Debug summary** (expand) fetches from Jam and caches for one hour:
  - console error and warning counts, and network status counts, from `getDetails.eventsSummary`
  - up to five console errors: the message, trimmed to 300 characters
  - up to five failed requests: method, host and path, status, and duration

  Request and response bodies, headers, cookies, and query strings are dropped before storage.

- With `jam.link`: **Attach Jam** (paste a `jam.dev/c/<id>` URL), **Unlink**, and **Request a recording**.

### W5. Request a recording (`jam.link`)

1. On an issue, **Request a recording** asks for an optional title and an expiry (default 30 days), then shows a link to copy:
   `https://recorder.jam.dev/<publicId>?jam-title=<title>&jam-reference=<signed reference>`
2. The signed reference is the issue's web URL (from `WEB_URL`) with a request token, for example `https://weaver.example.com/issues/WEB-123?jr=<requestId>.<signature>`. Jam's MCP tools do not expose the reference on the Jam (`getDetails` has none and `integrations` stays empty), so the backlink comment remains the reliable link from Jam to Weaver.
3. The person records. `jam.created` arrives with `recordingLink.reference`. Weaver verifies the signature, checks the request is not revoked or expired, and attaches the Jam to the issue the request row names. It does not trust the issue key in the URL, because issue keys change when an issue moves.
4. Weaver adds an activity entry, and a comment from the requester: `New Jam recorded for this request: <Jam URL>`. Normal comment notifications reach watchers.
5. A tampered, revoked, or expired reference sends the Jam to the inbox, flagged with the reason.

The panel lists active requests with the number of Jams received, plus **Revoke**.

### W6. Sync from Jam (`jam.triage`)

**Sync from Jam** calls `searchJams` for Jams created since the last sync cursor (at most 100 per click) and ingests any it has not seen, through the same routing as W2. S5 limits: search results and `getDetails` carry no page URL, media, or recording reference, so synced Jams always land in the inbox, with `getDetails` filling description and system info. Jams from the shared request link are flagged `recording_request_unmatched` for manual attachment. For a lost delivery, replay from the Svix portal first. This covers tenants whose Weaver is not reachable from the internet, and it backfills deliveries that exhausted Svix's retries.

## Issue description template

Built as a Weaver rich text document. It uses only node and mark types that `richTextDocumentSchema` accepts: paragraph, heading, bulletList, and the link mark.

```text
<Jam description, if any>

Jam
- Recording: Open in Jam (<jamUrl>)
- Captured on: <originalUrl>
- Reporter: <author name> <author email>
- Environment: <browser> <version> on <os> <version>, screen <width>x<height>, network <effectiveType>
- Captured at: <createdAt, tenant time zone>
- Submitter comment: <recordingLink.submitterComment, if any>

Console logs and network requests stay in Jam. The Jam panel on this issue shows a live summary.
```

The summary is the Jam title, or `Jam from <page host>` when the title is absent, trimmed to 500 characters.

## Architecture

```text
Jam workspace
  | jam.created (Svix-signed)
  v
POST /webhook/:tenantId  ->  verify  ->  snapshot (jam_items)  ->  route
                                                                     |
          +----------------------------+-----------------------------+
          |                            |                             |
          v                            v                             v
  signed reference:            create rule:                  no match / inbox rule:
  attach to requesting issue   create issue (P1)             triage inbox
          |                            |                             |
          +-------------+--------------+          (Create issue / Attach / Dismiss)
                        v
                 jam_issue_links  ->  backlink retry queue  ->  Jam MCP createComment

Issue panel  ->  GET summary  ->  JamMcpClient  ->  Jam MCP getDetails, getConsoleLogs, getNetworkRequests
```

### Webhook handler

1. Read `svix-id`, `svix-timestamp`, and `svix-signature`. Reject a missing header, or a timestamp more than five minutes from now, with `400`.
2. Compute HMAC-SHA256 over `${svix-id}.${svix-timestamp}.${rawBody}`. The key is the base64-decoded secret with the `whsec_` prefix removed. Compare it timing-safely against every `v1,` signature in the header, because Jam sends several during key rotation. Reject a mismatch with `400`.
3. Parse JSON with bounded depth and size (extract the bounded traversal from `validScmWebhook` into a shared helper). Identify the event by shape: `jamId` means `jam.created`. Acknowledge anything else with `200` and ignore it.
4. Validate the fields used: UUID `jamId`; `jamUrl` on `https://jam.dev/c/`; `teamId` equal to the configured workspace; known `type`; and URLs that are `https:` only.
5. Inside `processOnce(sha256(svix-id))`, insert the snapshot with `ON CONFLICT (jam_id) DO NOTHING`. If the Jam already has a link or a triage decision, stop. That makes redelivery and **Sync from Jam** idempotent on `jam_id`.
6. Route (W2). Folder matchers are the only ones that need a Jam call (`getDetails`, 5 second timeout). If that call fails, the Jam goes to the inbox.
7. Respond `200`. Target under 5 seconds total. A database failure returns `500` so Svix retries.

Duplicate-issue window: issue creation (P1) runs in its own transaction. A crash between creating the issue and inserting the link could leave an issue with no link, and a retry would create a second issue. The handler writes a `creating` marker on the snapshot first and checks it on retry. A stale marker sends the Jam to the inbox, flagged `possible duplicate`, so it is never created twice.

### JamMcpClient

A small adapter in the plugin. No MCP SDK dependency.

- `POST https://mcp.jam.dev/mcp` with `Authorization: Bearer <token>`, `Accept: application/json, text/event-stream` (required: `application/json` alone gets `406`), and JSON-RPC 2.0 bodies.
- Session: one `initialize` and `notifications/initialized` per process. The server issues `Mcp-Session-Id` but accepted later calls without it (S1), so the client does not depend on session affinity. It reinitializes on `404` or a session error.
- Read the SSE `data:` line (P3), then parse `result.content[].text` as JSON where the tool returns JSON. Strip the `?s=mcp` attribution parameter from returned Jam URLs. Validate only the fields the plugin uses, with zod, and ignore extra fields. A tool error or schema mismatch becomes a typed `JamUnavailable` error. The UI shows "Summary unavailable" and keeps working from the snapshot.
- Calls used: `getDetails`, `getConsoleLogs` (`logLevel: ['error']`, `limit: 5`), `getNetworkRequests` (`statusCode: ['4xx','5xx']`, `limit: 5`), `createComment`, `searchJams`, and, only if D5 falls back, `createRecordingLink`.
- `401` or `403` marks the connection **needs attention**, so the panel and admin page show a banner. Timeout is 10 seconds. Concurrency is one in-flight call per tenant per tool, so opening a busy issue page cannot fan out.
- Contract tests run against recorded fixtures for each tool. A changed shape fails CI instead of failing silently in production.

## Manifest sketch

```json
{
  "id": "@weaver/plugin-jam",
  "name": "Jam",
  "version": "0.1.0",
  "description": "Turn Jam bug reports into Weaver issues and request recordings from issues",
  "author": "Weaver Team",
  "icon": "bug",
  "type": "app",
  "scope": "tenant",
  "enabledByDefault": false,
  "uninstall": {
    "deletesPrivateData": true,
    "confirmationMessage": "Uninstalling Jam deletes Jam links, the inbox, routing rules, and recording requests in Weaver. Jams in Jam are not changed."
  },
  "entrypoints": { "server": "src/server/index.ts", "client": "src/client/index.ts" },
  "permissions": ["jam.view", "jam.link", "jam.triage", "jam.admin"],
  "requires": { "coreCapabilities": ["issue-create"] },
  "declaredPermissions": [
    {
      "key": "jam.view",
      "label": "View Jams",
      "description": "See linked Jams and debug summaries on issues you can read"
    },
    {
      "key": "jam.link",
      "label": "Link Jams",
      "description": "Attach, unlink, and request Jam recordings on issues you can edit"
    },
    {
      "key": "jam.triage",
      "label": "Triage Jams",
      "description": "Work the Jam inbox and create issues from Jams"
    },
    {
      "key": "jam.admin",
      "label": "Administer Jam",
      "description": "Manage the Jam connection and routing rules"
    }
  ],
  "settings": {
    "schema": {
      "jamWorkspaceId": { "type": "string", "required": true, "label": "Jam workspace ID" },
      "jamApiToken": { "type": "string", "required": true, "label": "Jam personal access token" },
      "jamAccessExpiresOn": { "type": "string", "label": "Token expiry date (YYYY-MM-DD)" },
      "jamWebhookSecret": { "type": "string", "label": "Webhook signing secret (whsec_...)" },
      "recordingLinkUrl": { "type": "string", "label": "Reusable recording link for requests" },
      "postBacklinkComments": { "type": "boolean", "default": true },
      "showDebugSummary": { "type": "boolean", "default": true },
      "notifyJamOnResolve": { "type": "boolean", "default": false },
      "autoCreateHourlyLimit": { "type": "number", "default": 20 }
    }
  },
  "events": {
    "subscribes": ["issue.status_changed"],
    "emits": ["jam.received", "jam.linked", "jam.unlinked"]
  },
  "ui": {
    "slots": [
      {
        "slot": "issue-detail-content",
        "component": "JamPanel",
        "requiredPermissions": ["jam.view"]
      }
    ],
    "navigation": [
      { "label": "Jam", "icon": "bug", "path": "/apps/jam", "requiredPermissions": ["jam.triage"] }
    ],
    "pages": [
      { "path": "/apps/jam", "component": "JamPage", "requiredPermissions": ["jam.triage"] }
    ]
  },
  "routes": [
    {
      "method": "POST",
      "path": "/webhook/:tenantId",
      "handler": "receiveJamWebhook",
      "public": true
    },
    {
      "method": "GET",
      "path": "/issues/:issueKey/jams",
      "handler": "listIssueJams",
      "requiredPermissions": ["jam.view"]
    }
  ],
  "migrations": [{ "version": "0.1.0", "path": "migrations/001_create_jam_tables.sql" }]
}
```

The expiry setting is named `jamAccessExpiresOn` on purpose. A key containing `token` would be masked as a secret, which would hide the date.

## Routes

All routes are mounted under `/api/v1/plugin-routes/@weaver~plugin-jam`. On every route except the webhook, an `:issueKey` parameter gets the host's project access check (read for `GET`, write otherwise).

| Method | Path                                              | Handler                  | Access                                                                        |
| ------ | ------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------- |
| POST   | `/webhook/:tenantId`                              | `receiveJamWebhook`      | `public`; Svix signature                                                      |
| GET    | `/connection`                                     | `getConnection`          | `jam.admin`                                                                   |
| POST   | `/connection/verify`                              | `verifyConnection`       | `jam.admin`                                                                   |
| POST   | `/sync`                                           | `syncFromJam`            | `jam.triage`                                                                  |
| GET    | `/inbox`                                          | `listInbox`              | `jam.triage`                                                                  |
| POST   | `/inbox/:jamId/create-issue`                      | `createIssueFromJam`     | `jam.triage`, plus a handler check of write access to the body's `projectKey` |
| POST   | `/inbox/:jamId/dismiss`                           | `dismissJam`             | `jam.triage`                                                                  |
| GET    | `/rules`                                          | `listRules`              | `jam.admin`                                                                   |
| PUT    | `/rules`                                          | `saveRules`              | `jam.admin`; every rule's project must be in `accessibleIds()`                |
| GET    | `/issues/:issueKey/jams`                          | `listIssueJams`          | `jam.view`                                                                    |
| POST   | `/issues/:issueKey/jams`                          | `attachJam`              | `jam.link`; the Jam must belong to the connected workspace                    |
| DELETE | `/issues/:issueKey/jams/:jamId`                   | `detachJam`              | `jam.link`                                                                    |
| GET    | `/issues/:issueKey/jams/:jamId/summary`           | `getJamSummary`          | `jam.view`; the Jam must be linked to this issue                              |
| GET    | `/issues/:issueKey/recording-requests`            | `listRecordingRequests`  | `jam.view`                                                                    |
| POST   | `/issues/:issueKey/recording-requests`            | `createRecordingRequest` | `jam.link`                                                                    |
| DELETE | `/issues/:issueKey/recording-requests/:requestId` | `revokeRecordingRequest` | `jam.link`                                                                    |

## Data model

The full model across phases, in the tenant schema. Version 0.1.0 (`migrations/001_create_jam_tables.sql`) creates `jam_items`, `jam_issue_links`, and `jam_plugin_state`; version 0.2.0 (`migrations/002_requests_rules_summaries.sql`) adds the other three tables, `request_id` and `rule_id` on links, and `suggested_project_id` on Jams:

```sql
CREATE TABLE IF NOT EXISTS jam_items (
  jam_id UUID PRIMARY KEY,
  team_id UUID NOT NULL,
  jam_url TEXT NOT NULL,
  jam_type VARCHAR(20) NOT NULL,             -- video | screenshot | sessionReplay
  title VARCHAR(500),
  description TEXT,                          -- capped at 10,000 characters on write
  original_url TEXT,
  origin VARCHAR(40),
  author_email VARCHAR(320),
  author_name VARCHAR(255),
  thumbnail_url TEXT,
  system_info JSONB NOT NULL DEFAULT '{}',   -- browser, os, screen, connection only
  recording_link_public_id VARCHAR(64),
  recording_reference TEXT,
  submitter_comment TEXT,
  jam_created_at TIMESTAMPTZ NOT NULL,
  received_via VARCHAR(20) NOT NULL,         -- webhook | sync | manual
  state VARCHAR(20) NOT NULL DEFAULT 'new',  -- new | creating | linked | dismissed
  flag VARCHAR(40),                          -- invalid_reference | rate_limited | possible_duplicate | routing_lookup_failed | recording_request_unmatched
  suggested_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  triaged_by UUID,
  triaged_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jam_items_inbox ON jam_items (state, received_at DESC);

CREATE TABLE IF NOT EXISTS jam_issue_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jam_id UUID NOT NULL REFERENCES jam_items(jam_id) ON DELETE CASCADE,
  issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  link_source VARCHAR(30) NOT NULL,          -- inbox | rule | attached | recording_request | jira_relink
  linked_by UUID,                            -- null when linked by the webhook
  backlink_state VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | posted | failed | disabled
  backlink_attempts INT NOT NULL DEFAULT 0,
  backlink_next_attempt_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (jam_id, issue_id)
);
CREATE INDEX IF NOT EXISTS idx_jam_issue_links_issue ON jam_issue_links (issue_id);

CREATE TABLE IF NOT EXISTS jam_routing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  match JSONB NOT NULL,                      -- see Routing rules
  action VARCHAR(10) NOT NULL,               -- create | inbox
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  issue_type_id UUID,
  priority VARCHAR(20),
  labels TEXT[] NOT NULL DEFAULT '{}',
  assignee_id UUID,
  hourly_limit INT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jam_recording_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL,
  mode VARCHAR(20) NOT NULL,                 -- url_parameter | dedicated_link
  recording_link_public_id VARCHAR(64),
  title VARCHAR(255),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  jams_received INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jam_recording_requests_issue ON jam_recording_requests (issue_id);

CREATE TABLE IF NOT EXISTS jam_summaries (
  jam_id UUID PRIMARY KEY REFERENCES jam_items(jam_id) ON DELETE CASCADE,
  summary JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS jam_plugin_state (
  key VARCHAR(64) PRIMARY KEY,               -- reference_secret | sync_cursor | last_webhook_at | connection_error
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Links key on `issue_id`, not the issue key, because moving an issue changes its key. The bundled SCM plugins key on `issue_key`; this plugin does not copy that.

`onInstall` generates `reference_secret` (32 random bytes). `onUninstall` drops the tables after the host's confirmation.

## Routing rules

`match` holds optional matchers. A rule applies when all of its matchers match:

| Matcher                 | Source                                                            | Example                                                    |
| ----------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------- |
| `urlHosts`              | `originalUrl` host, any of up to 20; `*.` also matches subdomains | `shop.example.com`, `*.shop.example.com` route to project SHOP |
| `pathPrefix`            | `originalUrl` path, at a segment boundary, case-insensitive       | `/checkout` matches `/checkout/pay`, not `/checkouts`      |
| `authorEmailDomain`     | `author.email`                                                    | `client.com`                                               |
| `recordingLinkPublicId` | `recordingLink.publicId`                                          | A client's dedicated recording link                        |
| `origin`                | `origin`                                                          | `recording_link`, `extension_chrome`                       |
| `titlePrefix`           | `title`, case-insensitive                                         | `[WEB]`                                                    |
| `folder`                | `getDetails.folder` (one Jam call)                                | Jam folder name or short ID                                |

Page host is the main matcher for an agency: the site where a Jam was captured usually identifies the client project. A host belongs to one project, and a project can have many hosts. Saving a rule whose host another project's rule already lists with the same path is refused with `409` and names that rule; different paths may split one host across projects. Wildcards are compared as written, so `*.client.com` and `shop.client.com` do not conflict and rule order decides. Rules saved with the earlier single `urlHost` still match. `create` rules have a per-rule hourly cap (default `autoCreateHourlyLimit`). A Jam over the cap goes to the inbox flagged `rate_limited`, so a flood of Jams from a public reusable link cannot flood a project.

## Security and privacy

- **Webhook authenticity.** The Svix signature with a five minute tolerance, plus the `teamId` check, means only the configured Jam workspace can write. The tenant ID in the URL selects configuration and is not a secret.
- **Recording reference forgery.** A reusable link's URL parameters are visible to the recipient. The reference is signed, so a recipient cannot point a recording at another issue. Signature: HMAC-SHA256 with `reference_secret` over `tenantId|requestId`, truncated to 128 bits, base64url. Reusing a valid reference only adds Jams to the issue that requested them, which is the intended behavior, until expiry or revocation.
- **Privilege crossing.** Summaries are fetched with one Jam member's token, so any Weaver user who can read the issue sees data that member can see. Mitigations:
  - summaries are limited to Jams linked to that issue
  - bodies, headers, cookies, and query strings are dropped
  - console messages are trimmed
  - `showDebugSummary` turns summaries off for the tenant
  - Full logs stay behind Jam's own link access.
- **Data minimization.** The plugin stores no media, logs, or raw payloads. `system_info` is limited to browser, OS, screen, and connection. Media URLs are public capability URLs on `cdn-jam-screenshots.jam.dev`. S4 fetched a thumbnail and the full video with no Jam session, so they bypass Jam's sharing settings. The plugin stores `thumbnailUrl` only, never `videoUrl`, shows the thumbnail only to issue readers, and never writes media URLs into issue descriptions or comments.
- **Secrets.** The token and webhook secret live in plugin settings. They are masked in API responses but stored in plaintext JSONB, the same as every plugin secret today. Sealing plugin secrets the way Jira import jobs are sealed (`sealImportJob`) is a platform improvement, not part of this plugin. The token must never be logged. Jam tokens start with `jam_pat_`, so secret scanners catch accidental commits.
- **Outbound content.** Backlink comments carry the issue key and URL only. Resolve comments (Phase 5) add the status name, never the issue title or Weaver comments.
- **Jam AI processing.** Some Jam MCP tools send content to Google Gemini. The plugin calls none of the video or transcript tools.
- **Client bundles.** The client runs with the viewer's session, like every federated plugin. It talks only to the plugin's own routes and never receives the Jam token.

## Operations and failure handling

| Failure                                | Behavior                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Token expired or revoked               | Calls fail with `401`. The connection is marked **needs attention**, and the panel still renders from snapshots. Backlinks stay `pending`. The admin page warns 14 days before `jamAccessExpiresOn`.                                                                                                                                                               |
| Jam MCP down or a tool's shape changed | Summaries show "unavailable". Webhook ingest is unaffected, because routing needs no Jam call unless a folder matcher is configured.                                                                                                                                                                                                                               |
| Backlink comment fails                 | Retried with backoff (1m, 10m, 1h, 6h), then a final attempt, 5 in all. A new link tries at once; due retries are drained, up to 10 at a time, by **Verify connection** and **Retry Jam comments**. Reads never drain. A rejected or missing token pauses retries without using attempts. After 5 attempts the state is `failed` and shown on the Connection page. |
| Webhook endpoint unreachable           | Svix retries for about 27 hours. After that, replay from the Svix portal. **Sync from Jam** backfills the Jams into the inbox but cannot recover recording references. Weaver's rate limit on unauthenticated requests (30 a minute per client address) also applies to webhooks, so a burst above that gets `429` and is retried by Svix.                         |
| Jam deleted in Jam                     | The snapshot remains, and the summary returns not found. The card shows "Deleted in Jam", and Unlink stays available.                                                                                                                                                                                                                                              |
| Issue deleted                          | Links and requests cascade. The Jam returns to the inbox only if it has no other links.                                                                                                                                                                                                                                                                            |

The Connection page shows the last verified webhook time, the last Jam call error, pending and failed backlinks, and token expiry.

## Phases

### Phase 0: Spikes

The spikes ran against the pilot Jam workspace, with a local webhook receiver behind a temporary Cloudflare quick tunnel. Results are in [Phase 0 results](#phase-0-results).

| ID  | Question                                                                                                      | Pass criterion                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| S1  | Can `context.http` drive Jam's MCP server with a PAT? Does it answer JSON or SSE? Is a session required?      | `tools/call getDetails` returns parsed JSON through `context.http`, or P3 is confirmed necessary                          |
| S2  | Does a `jam-reference` URL parameter on a reusable link appear as `recordingLink.reference` in `jam.created`? | The recorded test Jam's webhook payload carries the exact reference. If not, D5 falls back to per-request links.          |
| S3  | Which PAT scopes allow `createComment` and `createRecordingLink`?                                             | Both succeed with `mcp:write`, or the required scope is documented                                                        |
| S4  | Are webhook `media` URLs stable, and readable without a Jam session?                                          | A thumbnail URL still loads after 7 days in a signed-out browser, or the panel switches to a placeholder plus Open in Jam |
| S5  | Does `searchJams` expose a stable cursor and the fields the inbox needs, including linked Jira keys?          | A page of results maps to `jam_items` without a `getDetails` call per Jam                                                 |
| S6  | Does the oEmbed mini player render a Team-visibility Jam for a viewer without a Jam session?                  | Decides whether an embedded player (Phase 4, optional) is useful                                                          |
| S7  | Does Jam document or enforce MCP rate limits?                                                                 | Limits are recorded, and the client's concurrency cap is set below them                                                   |

### Phase 0 results

Run October 16, 2026 against the pilot workspace with a 7-day token scoped `mcp:read` and `mcp:write`. The MCP probe sent every request through a byte-identical copy of `packages/server-common/src/outbound-http.ts` and the same parsing as `PluginContextFactory.makeRequest`. The spike scripts lived in a scratch directory and are not committed.

| ID  | Result                                     | Evidence                                                                                                                                                                                                                                                                                                                                          |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Pass once P3 lands                         | `initialize`, `tools/list`, `getDetails`, `getConsoleLogs`, `getNetworkRequests`, `searchJams`, and `listRecordingLinks` all returned `200` as `text/event-stream`, so `context.http` gave `data: null` every time. A JSON-only `Accept` got `406`. Calls without `Mcp-Session-Id` succeeded. 200 to 370 ms per call.                             |
| S2  | Pass, with a recovery limit                | A Jam recorded through `recorder.jam.dev/JSVvqem?jam-reference=...&jam-title=...` arrived with the exact reference in `recordingLink.reference` and the requested title. A dedicated link's own reference also arrived. `searchJams` found the dedicated link's Jam by reference but not the URL-parameter Jam, and `getDetails` exposes neither. |
| S3  | Pass                                       | The token created a reusable recording link (365 ms) and a comment (342 ms). The link was revoked afterwards with `deleteRecordingLink`. A read-only token was not tested.                                                                                                                                                                        |
| S4  | Partial: public now; persistence unchecked | `thumbnailUrl` and `videoUrl` on `cdn-jam-screenshots.jam.dev` returned `200` to an unauthenticated request, with `cache-control: public, max-age=3600` and no signature parameters. Recheck the same URLs on or after October 23, 2026.                                                                                                          |
| S5  | Partial fail                               | `searchJams` (versioned `v: 1`) returns id, URL with `?s=mcp`, type, origin, title, author, folder, and timestamps, with `page.hasMore` and a cursor. It has filters for `recordingLink.reference` and `integration.id`. Neither it nor `getDetails` returns the page URL, media, or recording reference.                                         |
| S6  | Partial                                    | `jam.dev/oembed` returns an iframe of `jam.dev/mini/<id>`. That page sends no `X-Frame-Options` or `frame-ancestors`, and it rendered the screenshot, OS, browser, window size, and network speed for a signed-out browser. Team-only Jams were not tested, because that needs a workspace sharing change.                                        |
| S7  | No limits found                            | Jam's docs index mentions none. About 25 calls returned no rate-limit or `Retry-After` headers. Keep the per-tenant concurrency cap and treat `429` as a backoff signal.                                                                                                                                                                          |

Other observations:

- Four real `jam.created` deliveries (two from the extension, two from recording links) verified with the signature algorithm in [Webhook handler](#webhook-handler). Each had one signature version, clock skew of 0 to 1 seconds, and arrived 0.5 to 3.6 seconds after the Jam's `createdAt`.
- Extension Jams carried `originalUrl` (for example a page on the pilot's own Weaver host), which confirms page-host routing for extension captures. Recording-link Jams had no `originalUrl` or `description`, because the workspace has no connected domain. No `submitterComment` appeared.
- The Svix portal's event catalog offered `jam.created` and two Intercom events, but not `recording_link.created`.
- The token can call 35 tools, including the undocumented `analyzeVideo`, `fetch`, `search`, and `submitFeedback`.

### Phase 1: Core prerequisites

- [x] P1 `issue-create` capability through `IssuesService.create`, with manifest schema support and tests for events, activity, workflow initial status, and reporter access.
- [x] P2 `addComment` through `CommentsService` with an explicit actor, with tests for `comment.added`, mentions, and the non-null author.
- [x] P3 text responses in `context.http` (required by S1).

Verified October 16, 2026 on branch `feature/plugin-sdk-integration-prereqs` by `apps/api/test/plugin-integration-prerequisites.e2e-spec.ts` (real Postgres, no request user, as on a public webhook route) and `apps/api/src/plugins/plugin-context.factory.spec.ts`. Two corrections to the table above:

- `IssuesService.create` records no activity entry, on any path. `context.api.issues.create` writes a `created` entry for the reporter in the same transaction as the issue. Issues created in the UI or through forms still have none.
- The API emits `comment.created`, not `comment.added`. The SDK's `WEAVER_EVENTS.COMMENT_ADDED` names an event that is never sent; the unmerged `fix/event-catalog-alignment` branch aliases it to `comment.created`.

Both actors (`reporterId`, `authorId`) default to the request user and must hold the role permission the matching HTTP route requires (`issues.create`, plus `issues.assign` with an assignee; `comments.create`) and project write access. P3 is covered by unit tests with real `Response` objects and the real size limiter, not by a live Jam call.

### Phase 2: Connect, ingest, triage, panel

- [x] Plugin scaffold, manifest, migration, settings, and permissions.
- [x] Webhook verification, snapshot, idempotency, and inbox routing (no rules yet).
- [x] `JamMcpClient` with `getDetails` and `createComment`, plus fixtures and contract tests.
- [x] Connection page: webhook URL, Verify, status, and expiry warning.
- [x] Inbox: Create issue (field picker, description template, reporter mapping), Attach to issue, Dismiss.
- [x] Issue panel: snapshot cards, Attach Jam by URL, Unlink.
- [x] Backlink comments with the retry queue.
- [x] Sync from Jam.
- [x] End to end against a real Jam workspace (acceptance criterion 10), October 17, 2026. A local Weaver ran this branch against the pilot workspace with a real token, behind a Cloudflare quick tunnel that forwarded only the webhook route. Results:
  - **Connection:** **Verify connection** confirmed the token's workspace through real `searchJams` and `getDetails` calls.
  - **Extension Jam:** a Jam captured with the extension on drudgereport.com reached the inbox, with its page URL.
  - **Create and summarize:** creating JAM-2 from it posted "Tracked in Weaver as JAM-2" on the Jam. The debug summary showed real counts (16 console entries; 366 requests, 3 failed with 400, 401, and 422), the console error, and the failed requests without their query strings.
  - **Resolve:** moving JAM-2 to Done posted "JAM-2 was resolved in Weaver (Done)" on the Jam, and Jam rendered the mention as a mention of the author.
  - **Recording request:** a recording made through JAM-1's request link attached to JAM-1 by its signed reference, the requester's comment appeared on JAM-1, and the Jam got its link-back comment.
  - **Bug found and fixed:** Jam stores its editor placeholder, "Write a description or @ to mention", as the description when the reporter writes none, and it had become the first paragraph of JAM-2. The plugin now ignores that text.

#### Phase 2 implementation notes

Implemented October 16, 2026 in `plugins/plugin-jam` (version 0.1.0) on `feature/plugin-sdk-integration-prereqs`, not merged.

Evidence:

- `apps/api/test/jam-plugin.e2e-spec.ts`, 15 tests on a real Postgres, with Jam's MCP server faked at the plugin HTTP boundary using the event-stream replies seen in Phase 0. It covers signed and replayed webhooks; tampered, stale, wrong-secret, and other-workspace refusals; issue creation with reporter mapping and fallback; the description template; backlinks posted, deferred while Jam is down, and retried; attach by URL from Jam, refusals, and unlink back to the inbox; viewer and outsider access; a rejected token and recovery; sync; the `jam.admin` gate; and confirmed uninstall.
- The running app (API and web dev servers on a throwaway database) showed the inbox, the create-issue form, the created issue's description and Jam panel, the Connection page, and the sidebar entry. Its dummy token was rejected by Jam's real server, which exercised the `401` path through `context.http`.
- Plugin-related end-to-end suites (71 tests) and the API unit suite (420 tests) pass. The full end-to-end suite has one failure, in `password-reset.e2e-spec.ts`: it asserts the order of two background email jobs that race, and this branch does not touch that path.

Differences from the design above:

- Two more SDK methods: `context.api.users.findMemberByEmail` maps a Jam author to a tenant member, because `users.get` and `users.list` are stubs; `context.api.projects.assertAccess` checks the body's `projectKey` on **Create issue**.
- Server code is one `handlers.ts`. In development the API loads plugin TypeScript with Node's type stripping, where extensionless relative imports do not resolve.
- `context.db.query` returns `[rows, rowCount]` for a top-level `UPDATE` or `DELETE`, so statements that need `RETURNING` rows run inside a CTE.
- The manifest `type` is `app`, because the sidebar lists navigation only for `app` plugins.
- The create form has no assignee picker, because the project members endpoint returns no names; the route accepts `assigneeId`.
- Thumbnails load with `referrerPolicy="no-referrer"`, so Jam's media host never sees Weaver page URLs.

### Phase 3: Request a recording

- [x] Recording requests: signed reference, copy link, list, and revoke.
- [x] Webhook attach path for valid references, with inbox flags for invalid ones.
- [x] Requester comment on arrival. There is no activity entry: the activity log shows unknown actions by their raw name, and the comment already notifies watchers.
- [ ] Optional: per-request recording links for tenants that want requests searchable in Jam (costs link quota).

### Phase 4: Rules and debug summary

- [x] Routing rules UI and engine, including hourly caps and the optional folder lookup.
- [x] Debug summary with redaction and one-hour cache.
- [x] Optional embedded player, behind the `embedPlayer` setting, off by default. The enforced web CSP sets no `frame-src`; the report-only policy now allows `https://jam.dev`. S6: it renders only for Jams shared with anyone who has the link, and then for anyone holding the URL. Requires a `frame-src https://jam.dev` allowance in the web CSP.

### Phase 5: Optional extensions

- [x] Resolve comment on the Jam when a linked issue reaches a done-category status, mentioning the Jam author when the author is a Jam member.
- [ ] Jira relink: for tenants that imported from Jira, find Jams whose linked issue keys match imported issues (`import_records`), show a dry-run list, then link them on approval. Not started: it needs a Jam linked to Jira to learn the shape of `integrations` in Jam's replies, and the pilot workspace has none.
- [ ] Intake forms: an optional **Record your screen** step that opens a recording request for the issue the form creates. Not started: it needs an extension point on the core public form's confirmation page, because core forms should not depend on this plugin.
- [ ] Per-user Jam connection through Jam's OAuth with dynamic client registration, so each user's Jam access governs what they see. Not started: an OAuth client, per-user token storage, and refresh are more work than the rest of the plugin.
- [ ] More than one Jam workspace per tenant. Not started: every table and setting assumes one workspace.

#### Phases 3 to 5 implementation notes

Implemented October 17, 2026 as plugin version 0.2.0 on `feature/plugin-sdk-integration-prereqs`, not merged.

Evidence:

- `apps/api/test/jam-plugin.e2e-spec.ts` now has 24 tests. The new ones cover:
  - **Recording requests:** the signed link; the issue key shown in the link is ignored; the arrival comment is posted as the requester; tampered, revoked, and expired requests land in the inbox with the reason; the link setting and write access are required.
  - **Routing rules:** issue creation up to the hourly limit, then a suggestion; first match by order; inbox rules only suggest; disabled rules are skipped; folder matching through Jam; validation and permissions.
  - **Debug summary:** counts; query strings, bodies, headers, and tokens removed; caching; refusal for an unlinked Jam or with the setting off.
  - **Resolve comments:** the comment with the author mention.
- In the running app on a throwaway database, I checked the inbox's suggested-project label, the Rules tab and its form, and a recording request on an issue with the requester's comment. A rule-created issue had the rule's priority and label. The summary showed the error path with Jam's real `401` for a dummy token.
- The API unit suite (420 tests) and the plugin end-to-end suites (80 tests) pass. Migration 002 applied cleanly over 001 with existing data, and again a second time.

Differences from the design above:

- The lifecycle hooks and `onEvent` live in `handlers.ts`, which is now the server entrypoint, and `index.ts` is gone. Development's type stripping cannot import between plugin files, and `onEvent` needs the Jam client.
- Routing runs after the webhook transaction commits. It first claims the Jam (`new` to `creating`), so a failure leaves the Jam in the inbox with a flag instead of a retry creating a duplicate issue.
- A rule creates issues as the Jam author when they may report, otherwise as whoever last saved the rule. Saving a rule therefore requires write access to its project.
- Rules use per-rule routes (`POST /rules`, `PATCH` and `DELETE /rules/:ruleId`, `POST /rules/reorder`) instead of `PUT /rules`, so rule IDs stay stable for the hourly caps.
- Resolve comments are posted after the status change's request finishes, because plugin events run inside that request.
- **Sync** flags Jams that came through a recording link as `recording_request_unmatched`, since synced Jams carry no reference.
- Jam's console events carry `console_level` and `console_message`, confirmed on a real Jam on October 17. The summary also accepts `message`, `text`, and `args`. Network event fields were observed during the spikes.
- In development, edits to a plugin's server code take effect only after an API restart. The loader drops a module from Node's CommonJS `require` cache, but plugin TypeScript loads as an ES module under type stripping, and that cache is not cleared that way. The real-workspace run hit this when routing rules changed.
- Routing rules take several hosts and a path prefix, and refuse a host already routed to another project (added October 17 after the real-workspace run).
- The two new end-to-end specs listen on a fixed port (`app.listen(0, '127.0.0.1')`). Supertest's per-request servers failed twice in ten runs; the unmerged `fix/flaky-api-integration-tests` branch applies the same fix to every spec.

## Acceptance criteria

1. A `jam.created` delivery with a valid signature from the configured workspace produces exactly one `jam_items` row and one routing outcome. Receiving the same `svix-id` or `jamId` again changes nothing.
2. A bad signature, a timestamp more than five minutes off, a missing header, or a different `teamId` gets a `400`, and no row is written.
3. **Create issue** produces an issue through `IssuesService.create`. The `issue.created` event fires, an activity entry is recorded, the reporter follows the matching rule, and the description matches the template. A link row is created, and within one retry cycle a backlink comment appears on the Jam.
4. A Jam recorded through a recording request attaches to the requesting issue even after that issue moves to another project. A tampered, revoked, or expired reference lands in the inbox with the matching flag.
5. A user without read access to an issue's project gets the host's denial on every `/issues/:issueKey/...` route. `getJamSummary` refuses a Jam that is not linked to the named issue.
6. Stored and returned summaries contain no request or response bodies, headers, cookies, or query strings (unit tests run on fixtures containing all four).
7. With the token revoked, issue pages still render Jam cards, the Connection page shows **needs attention**, and backlinks resume after a new token is saved.
8. A `create` rule with `hourly_limit` 20 creates 20 issues in an hour. The 21st matching Jam is in the inbox flagged `rate_limited`.
9. Uninstall with confirmation removes every plugin table, and Jam data is untouched.
10. A real end-to-end run against the pilot workspace has been performed: capture with the extension, record through a recording request, create from the inbox, open the summary, and see the backlink in Jam. The roadmap records it as evidence, separately from automated tests.

## Out of scope

- Creating Jams from Weaver. The Jam CLI can, but MCP cannot, and Weaver has no reason to.
- Making Weaver a destination inside the Jam extension. Only Jam can add that.
- Copying Jam media or logs into Weaver attachments. Plugins have no attachment API, and the HTTP client caps responses at 1 MB.
- Two-way field sync (title, description, status) between Jam and Weaver.

## Related finding

The bundled GitHub, GitLab, and Bitbucket manifests declare the slot `issue-detail-panel`. `IssueDetailPage` renders only `issue-detail-content` and `issue-detail-sidebar`, so those link panels never appear. This plugin uses `issue-detail-content`.

## Sources

Jam, all checked October 16, 2026:

- [Jira integration](https://jam.dev/docs/jira) and [integrations overview](https://jam.dev/docs/integrations-overview)
- [Webhooks and events](https://jam.dev/docs/webhooks)
- [Personal access tokens](https://jam.dev/docs/personal-access-tokens) and [MCP](https://jam.dev/docs/jam-mcp)
- [Recording Links](https://jam.dev/docs/recording-links)
- [Pricing](https://jam.dev/pricing), page dated October 15, 2026
- [MCP protected-resource metadata](https://mcp.jam.dev/.well-known/oauth-protected-resource)
- [Jira Marketplace listing](https://marketplace.atlassian.com/apps/1229157): its API record shows no Connect or Forge artifact, so there is no Jam panel inside Jira (inferred)
- The pilot Jam workspace settings (Integrations, Webhooks, Jam SDK, MCP, CLI) and a live `getDetails` response, used for field shapes

Weaver source on main `5db1948`:

- [packages/sdk/src/interfaces/plugin-context.interface.ts](../../packages/sdk/src/interfaces/plugin-context.interface.ts)
- [apps/api/src/plugins/plugin-context.factory.ts](../../apps/api/src/plugins/plugin-context.factory.ts)
- [apps/api/src/plugins/inbound-webhook.service.ts](../../apps/api/src/plugins/inbound-webhook.service.ts)
- [apps/api/src/core/security/settings-secrets.ts](../../apps/api/src/core/security/settings-secrets.ts)
- [apps/api/src/modules/forms/forms.service.ts](../../apps/api/src/modules/forms/forms.service.ts)
- [packages/db/src/entities/tenant/comment.entity.ts](../../packages/db/src/entities/tenant/comment.entity.ts)
- [packages/shared/src/schemas/rich-text.ts](../../packages/shared/src/schemas/rich-text.ts)
- [plugins/plugin-github](../../plugins/plugin-github)
- [docs/plugin-manifest-reference.md](../plugin-manifest-reference.md)
