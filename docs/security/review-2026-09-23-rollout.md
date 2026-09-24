# September 23 review: deployment notes

These changes are prepared locally. This document does not authorize a deployment or a data migration.

## Configuration changes

- API and worker use Node 22 and the shared `@weaver/server-common` package. Rebuild both images together.
- Configure a distinct Redis password on the server and every API/worker client. The production runtime refuses missing database/Redis passwords and the `weaver_dev` placeholder. Do not change passwords without coordinating existing clients.
- API and worker need the same `IMPORT_CREDENTIAL_KEY` to run Jira imports. Store 32 random bytes encoded as base64 in the installation's secret store. It is separate from JWT keys. Import payloads use AES-256-GCM, bound to tenant and job IDs. No plaintext fallback is accepted. Finish or explicitly cancel existing imports before updating both components, and retain the old deployment and queue backup for rollback. Key rotation must drain pending jobs first.
- `TRUST_PROXY` defaults to false in code. Templates use `uniquelocal` for their private reverse-proxy network. Set this to the actual trusted proxy subnets for the installation, and restrict direct API ingress. Do not set it to `true` for arbitrary clients.
- Authentication and public-form routes return 503 if Redis-backed rate limiting is unavailable. API-key rate limiting does the same. Other ordinary authenticated traffic retains its availability-first fallback.
- Production tenant registration now fails closed unless `ALLOW_TENANT_SCHEMA_BOOTSTRAP=true` is explicitly configured. The opt-in permits synchronization only after creating a new schema; it cannot reuse an existing schema. Existing tenant migrations still require a reviewed schema plan. This is a containment measure, not a replacement for versioned tenant migrations.
- Tenant/plugin secret fields are masked in settings responses. Sending the mask or an empty string preserves the saved value. Explicit null/removal semantics still depend on the setting's schema. Settings remain plaintext in PostgreSQL; database encryption/key rotation is a separate migration.
- Bitbucket now requires the configured webhook secret and the provider's `X-Hub-Signature: sha256=...` HMAC over the raw body. Configure the secret in Bitbucket and remove the token segment from the callback path, leaving `/api/v1/plugin-routes/@weaver~plugin-bitbucket/webhook/:tenantId`. Preserve the existing tenant ID segment. Old token-bearing URLs are rejected. See [Bitbucket webhook documentation](https://support.atlassian.com/bitbucket-cloud/docs/manage-webhooks/).
- Gravatar is disabled by default. Set `VITE_GRAVATAR_ENABLED=true` at frontend build time only when external avatar lookups are wanted. Initials and uploaded avatars continue to work.

## Uploads and charts

API and worker must use the same storage backend, bucket, credentials, and path. The main Compose template shares its existing upload volume. The older Docker template now uses a node-owned shared path. Back up existing uploads and map the old volume into the new path before switching an existing installation; do not create an empty replacement volume by changing its Compose project name.

New imported attachments use UUID-only keys. Historical imported keys may contain filenames and may already be unreadable under the API's existing storage-key policy. Inventory and migrate those records/files together before asserting historical attachment parity. No historical records or files were rewritten in this review.

Kustomize `base` is an overlay component, not a standalone install. The dev overlay creates development secrets. Production requires a separately managed `weaver-secrets` Secret, including database, Redis, and distinct JWT/refresh secrets; include the import key when imports are enabled. Configure the production bootstrap opt-in through the ConfigMap only after review.

Kubernetes local storage requires a shared ReadWriteMany PVC accessible to API and worker with UID/GID 1000. Select an appropriate storage class or provision it explicitly. The NetworkPolicies require a CNI that enforces them and currently allow ingress from the `ingress-nginx` namespace. Adapt that selector to the actual ingress controller before applying.

The web image renders its Nginx config from `WEAVER_API_UPSTREAM` (default `api:3000`); Helm supplies its release-specific API service name. The Helm chart supports external PostgreSQL and Redis. Configure `postgresql.external.host`, `postgresql.auth.password`, `redis.external.host`, `redis.password`, distinct JWT keys, and `storage.existingClaim`. Bundled database flags now fail with an explanatory message. Defaults are intentionally insufficient to deploy insecure placeholder infrastructure.

The repository plugin is version 1.0.1 so existing installations run the newly supplied table migration. Back up tenant schemas before any plugin upgrade. The migration creates missing tables/indexes and does not delete existing data.

## Operational limits

- Scheduled automation queries matching more than 100 issues fail before performing actions. Narrow the rule. The cap prevents both request storms and silent processing of an arbitrary first page.
- Sprint dates use calendar strings and must form a valid range of at most 366 days. Longer or corrupt historical ranges now return a validation error.
- Aggregate views and exports traverse all response pages and fail explicitly if pagination is incomplete or exceeds the safety ceiling. Very large installations may still need server-side streaming exports.
- Run server processes with `TZ=UTC` while legacy timestamp-without-time-zone columns remain. The frontend calendar-date correction does not migrate those timestamps or implement tenant-timezone dashboard semantics.

Before deployment, retain database/upload/queue backups, the exact previous images and configuration, inspect schema changes, and verify login, private-project boundaries, plugin pages, upload/download, and imports against the candidate environment. Helm rendering and local builds do not establish acceptance on a production cluster or S3 account.
