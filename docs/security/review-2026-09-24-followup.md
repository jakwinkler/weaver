# Additional review fixes

This change implements the actionable follow-ups identified when comparing the additional September 23 review with release `ca81db0`. The older report's already-fixed claims and deferred architecture work are not reopened here.

## Implemented

| Finding                   | Result                                                                                                                                                                                                                                                                                                                                         |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S-M21                     | Nginx and Kubernetes ingress allow an 11 MiB request body, accommodating the default 10 MiB attachment plus multipart overhead. API file and JSON limits remain independent.                                                                                                                                                                   |
| S-M15                     | Shared rich-text validation covers comments, issue descriptions, and wiki pages. It bounds nesting at 32, nodes at 5,000, serialized length at 100,000 characters, and supported nodes, marks, attributes, and URL schemes. Mention traversal is iterative and bounded.                                                                        |
| S-M20                     | Attachment deletion commits a durable storage-cleanup intent with removal of its database row. File removal happens after commit, with retained intents for retry after storage/database failures or restart.                                                                                                                                  |
| S-M19                     | Initial-status switches and project creation use tenant transactions and advisory locks. Failed saves roll back prior state; concurrent project creation returns a controlled conflict.                                                                                                                                                        |
| S-M8                      | API and worker reject missing or unsupported environment modes. Only explicit `development`, `test`, and `production` are accepted. Production credential validation remains mandatory. The worker development command explicitly selects development mode.                                                                                    |
| S-M10                     | Web responses receive nosniff, referrer policy, framing protection, baseline CSP, and HTTPS HSTS. Public-form documents retain embedding support. A fuller CSP runs in report-only mode.                                                                                                                                                       |
| S-M6 / S-L5               | GitHub, GitLab, and Bitbucket authenticate before validating consumed payload fields and processing a delivery. Tenant/plugin-scoped receipts deduplicate authenticated payload digests for seven days, including concurrent replays with changed delivery headers. Database errors abort processing instead of being acknowledged as success. |
| S-L8 / S-L4               | WQL validates UUIDs, dates, priorities, and field/operator combinations before querying. Webhook creation rejects nonexistent project references.                                                                                                                                                                                              |
| S-M9                      | Plugin module and migration loading checks both lexical and real filesystem containment, rejecting escaped symlink targets.                                                                                                                                                                                                                    |
| S-M17                     | Checklist's manifest no longer advertises a missing legacy SQL file; its existing `onInstall` lifecycle remains authoritative.                                                                                                                                                                                                                 |
| S-L17                     | Workers and worker-owned queues report connection errors without logging raw connection details. An opt-in test confirms processing resumes after their Redis clients disconnect.                                                                                                                                                              |
| Development configuration | Host-facing development PostgreSQL and Redis ports bind to loopback by default.                                                                                                                                                                                                                                                                |

## Deployment and rollback

Two additive tenant tables, `attachment_cleanup` and `inbound_webhook_receipts`, are created by the idempotent `002-review-reliability` migration when a tenant connection initializes or a tenant is provisioned. Migration execution is transactional and serialized per tenant. It does not rewrite existing application rows or attachment files. The TypeORM metadata includes both tables so schema planning and development synchronization remain consistent.

Before a later deployment, retain the existing database/storage backup and image pins. Review the schema plan, deploy the API with its compatible SDK and SCM plugin bundles, and verify startup and the new tables. Production must explicitly set `NODE_ENV=production`. This implementation does not enable general TypeORM synchronization in production or replace the separate fresh-install migration work.

Storage cleanup runs once per minute in the API, processing up to 100 intents per tenant per sweep. Multiple API replicas coordinate through row locks. API and cleanup use the same configured storage adapter. `ATTACHMENT_CLEANUP_ENABLED=false` is for isolated tests or a deliberate maintenance pause; pending cleanup remains durable while paused. Monitor cleanup warnings and table growth. An unsuccessful storage operation leaves its intent for the next attempt. A completed database deletion immediately makes the attachment unavailable through the application, even while physical cleanup is pending.

Before rolling back to code without the cleanup service, drain outstanding cleanup intents or keep a compatible cleanup process running. Retain the additive tables during rollback; dropping a nonempty cleanup table loses the retry bookkeeping. Existing attachment rows and stored files do not need a reverse data migration.

Every outer reverse proxy must permit the larger request size too. `deploy/compose/nginx-tls-security.conf` is an include for the site's existing HTTPS server block. The proxy must forward the original scheme, and operators must run `nginx -t` before reloading. The web container and both Kubernetes ingress templates carry the corresponding 11 MiB ceiling. If an operator raises `ATTACHMENT_MAX_BYTES` above the default, adjust all proxy ceilings to allow multipart overhead as well.

The enforced CSP currently covers framing, object sources, and base URLs. The more restrictive resource policy is report-only so federation, sockets, images, and embedded forms can be observed before enforcement. Reports appear in browser diagnostics; this change does not add a report collector. The HSTS policy deliberately does not include subdomains or preload registration.

Webhook receipts and database link writes commit together. Failed processing rolls back both and can be retried. The existing event dispatcher runs after commit and remains best effort: this is replay suppression, not an exactly-once guarantee for every downstream notification or automation. A crash between commit and dispatch is not solved by the receipt table; a durable event outbox is separate architecture work. Expired receipts are removed incrementally during successful new deliveries, with up to 100 removals per transaction. Inactive tenants retain expired receipts until another delivery arrives.

## Verification

Regression tests were observed failing before their fixes for malformed/deep rich text, environment modes, typed WQL input, workflow rollback, attachment preservation, webhook replays and failed writes, plugin path escapes, project provisioning rollback, project-reference validation, and proxy/header configuration.

The completed local checks include:

- 240 API unit tests across 49 suites.
- 86 API integration tests across eight suites against disposable PostgreSQL and Redis, covering the new failure/concurrency cases plus workflows, mentions, wiki pages, forms, attachments, plugin loading, and plugin upgrades.
- 150 frontend tests and 74 shared-schema tests.
- SDK, database, server-common, and worker tests, plus an explicit Redis disconnection/recovery test. The recovery test opts in through `WEAVER_WORKER_TEST_REDIS_PORT` and disconnects only its own named clients.
- Workspace type checking, API/worker/SCM-plugin and web builds, lint with no errors, and Nginx configuration validation. Existing lint warnings and the web build's large-chunk warning remain.
- Runtime checks through the local Nginx container: 2 MiB and 10 MiB uploads, byte-identical downloads, application rejection at 10 MiB plus one byte, proxy rejection above 11 MiB, and continued rejection of 200 KB JSON bodies.
- Browser acceptance against the local built app: authenticated issue navigation, comment creation, description persistence after reload, and public-form rendering/submission from a cross-origin iframe. Header checks cover application pages and public forms, including trailing slashes and query strings.

Useful commands:

```sh
pnpm --filter @weaver/api exec jest --runInBand
pnpm --filter @weaver/shared exec jest --runInBand
pnpm --filter @weaver/web test
pnpm exec turbo run typecheck
node --test docker/http-boundaries.test.cjs
WEAVER_E2E_DATABASE=weaver_e2e_followup \
  WEAVER_E2E_DATABASE_PORT=55439 WEAVER_E2E_REDIS_PORT=56389 \
  pnpm --filter @weaver/api exec jest --config test/jest-e2e.config.js \
  --runInBand --runTestsByPath test/review-followup.e2e-spec.ts
WEAVER_WORKER_TEST_REDIS_PORT=56389 \
  pnpm --filter @weaver/worker exec vitest run src/worker-recovery.spec.ts
```

These changes were locally verified and committed. No push or production deployment is included in this follow-up.

## Separate planned work

Fresh-production schema bootstrap/versioned migrations, secret encryption and rotation, aggregate database connection budgets, storage quotas/reference-aware abandoned-upload cleanup, measured secondary indexes, stable historical sprint-status identifiers, compatible dependency upgrades, and isolation for any future untrusted-plugin runtime remain separate work. The prior review's blanket user-login requirement for signed provider webhooks, unsupported synchronization/Multer claims, and proposed runtime/Redis-default changes were intentionally not implemented.
