# API keys and integrations

Create a personal API key when a script or integration needs to call Weaver. Give each integration its own named key, choose the smallest useful scope, and set an expiration where practical. A key has your account's access; it does not bypass project permissions.

## Create and keep a key

Open **Profile → API Keys**, choose the create action, enter a recognizable name, choose scopes, and optionally set an expiration. Copy the new key into your integration's secret store when it is shown. Weaver only shows the full key once.

Do not put a key in issue descriptions, wiki pages, screenshots, source control, or a URL query string. If you lose it, create a replacement and revoke the old one. If you suspect exposure, revoke it promptly.

| Scope | Use |
| --- | --- |
| Read | Fetch accessible data |
| Write | Perform permitted write operations |
| Admin | Administrative API operations, subject to the user's actual role and permissions |

Choose both Read and Write for an integration that needs to fetch and update data. Write alone is not an implicit Read grant. Admin scope is broader, but still does not turn a member into an administrator.

## Call the API

Use your installation's API base, usually `https://<weaver-host>/api/v1`, and send the key as an `Authorization: Bearer` header. Use a secret-management facility to inject it. Avoid printing request headers or full error dumps containing credentials.

For a first read, request `GET /auth/me` or `GET /projects`. Follow pagination rather than assuming the first page contains all records. Rate limits are per key; back off after a 429 response instead of retrying in a tight loop. If rate limiting is temporarily unavailable, a key request returns 503; retry after the service recovers.

The API Keys list shows names, scopes, creation, last use, and expiration. Revoke a key that is no longer needed. Last-used timestamps update periodically, so they are not a per-request audit trail.

## Send events to another system

Administrators can configure **Webhooks** with the destination and events they want to receive. An automation can also send a webhook as an action. These are outbound calls, so review the receiver, data, authentication, and retry behavior before enabling them. Each delivery carries an `X-Webhook-Delivery` id that stays the same across retries, so a receiver can ignore duplicates. The webhook's delivery list records every attempt, and Weaver switches a webhook off after the last retry of a delivery fails.

Install integration plugins through [Plugins](https://github.com/jakwinkler/weaver/wiki/Plugins) when that is the intended connection. A plugin's presence in the catalog does not prove its external service is configured or working.

---

## Technical reference (developers and LLMs)

The guidance above covers everyday use. The details below explain API contracts, implementation, and operational limits.

API key routes are `POST /api-keys`, `GET /api-keys`, and `DELETE /api-keys/:id`. Creation accepts `name`, a nonempty unique `scopes` array drawn from `read`, `write`, and `admin`, and optional `expiresAt`.

Keys use the `wvr_` prefix and are stored as SHA-256 hashes. Authentication checks expiration and current tenant membership, derives the user/tenant context, and enforces both scope and endpoint permissions. Key rate limiting uses Redis and allows 100 requests per 60-second window. Last use is updated at most once every five minutes.

In the pilot release, the rate-limit guard returns 503 when Redis is unavailable instead of allowing unmetered key requests.

The guard checks the scope required by the endpoint: reads need Read, writes need Write, and administrative permission categories need Admin. Admin scope satisfies scope checks but does not replace role or project guards. Some interactive-only endpoints use a JWT-only guard and should not be assumed to accept API keys.

API-key behavior in this guide is source-reviewed. This documentation walkthrough did not mint or publish an API credential. See [Developer Reference](https://github.com/jakwinkler/weaver/wiki/Developer-Reference) for route and pagination conventions.

### Source reference

Checked against source revision [`1b1b370`](https://github.com/jakwinkler/weaver/commit/1b1b3704c37b4d1ab09347508d57968e1de38130).

- [apps/web/src/features/profile/ApiKeysTab.tsx](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/web/src/features/profile/ApiKeysTab.tsx)
- [apps/web/src/features/profile/CreateApiKeyDialog.tsx](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/web/src/features/profile/CreateApiKeyDialog.tsx)
- [apps/api/src/modules/api-keys/api-keys.service.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/api/src/modules/api-keys/api-keys.service.ts)
- [apps/api/src/core/auth/api-key.guard.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/api/src/core/auth/api-key.guard.ts)
- [apps/api/src/core/auth/api-key-rate-limit.guard.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/api/src/core/auth/api-key-rate-limit.guard.ts)

Pilot update checked against [`ce5494a`](https://github.com/jakwinkler/weaver/commit/ce5494a445f0a5412cf7e0be378308afbeb5e5f8): [rate-limit guard](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/apps/api/src/core/auth/api-key-rate-limit.guard.ts).
