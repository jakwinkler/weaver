# Jira import: local implementation and verification

November 16, 2026. Base checkout: `f0d7cae`, with pre-existing uncommitted work. Implementation is local and uncommitted. No push, deployment, production mapping, invitation, or EPD reimport was performed. The original working tree was captured in `/private/tmp/weaver-jira-20261116-baseline/` before edits.

Approved scope: [large attachments and issue security plan](../roadmap/31-jira-large-attachments-and-issue-security-plan.md), plus imported-people discoverability and numeric descending ticket ordering.

## Result

- Imported attachments stream through download, hashing, local/S3 storage, integrity verification, and authenticated destination downloads. The configurable default cap is 512 MiB; interactive uploads retain their separate limit.
- Attachment errors identify the file, source issue, failure category, actual/expected size where available, and retry eligibility. Selected-file recovery takes fresh credentials, rechecks current Jira visibility, retains the original report, and preserves unrelated file reviews. Ambiguous legacy associations require a full reviewed reimport.
- Secured native issues use explicit tenant-local policies. Owners/admins retain access; other readers need project access, a reviewed issue audience, and any narrower child permission. Missing or changed source restrictions remain quarantined until reviewed. Mapping records before/after audiences and rejects stale reviews.
- Imported people are searchable under **Settings > Import / Export > Imported people and restricted audiences**, with links from **Users** and import results. Linking an existing member and reviewing an invitation are distinct actions. Former employees can remain historical people indefinitely. Michael Simmerson was represented only in a synthetic local UI fixture; no real account or invitation was created.
- Full imported-project issue lists default to descending numeric ticket key, including across pagination. Explicit sort selections and native-project/manual ordering are preserved.

## Operational choices

| Setting or boundary                  | Implemented behavior                                                                                                                                                                                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `JIRA_IMPORT_ATTACHMENT_MAX_BYTES`   | Default `536870912`; positive integer validation, metadata preflight and actual-byte enforcement                                                                                                                                                             |
| Header / idle / total timeout        | `JIRA_IMPORT_ATTACHMENT_HEADER_TIMEOUT_MS=30000`, `JIRA_IMPORT_ATTACHMENT_IDLE_TIMEOUT_MS=60000`, `JIRA_IMPORT_ATTACHMENT_TIMEOUT_MS=900000`                                                                                                                 |
| Retries                              | At most three attempts for transient transport/429/5xx failures, bounded backoff; restart each attempt from zero                                                                                                                                             |
| Aggregate import concurrency         | One active import transfer slot across worker processes, protected by a PostgreSQL advisory lock; one organization import lock remains authoritative                                                                                                         |
| Interrupted storage                  | Private local temporary files, atomic rename; bounded 8 MiB S3 multipart buffers with abort; durable owned-write journal cleans orphaned files/uploads without deleting referenced objects                                                                   |
| Download authorization               | Full, HEAD and single-range requests checked before opening storage; active streams recheck membership and file/issue/project access every five seconds                                                                                                      |
| Browser revocation                   | Content-free websocket invalidation plus a content-free access revision poll every 30 seconds; reset cached queries on revision changes                                                                                                                      |
| `JIRA_IMPORT_ISSUE_SECURITY_ENABLED` | Default **off**. Local fixtures explicitly enable secured native imports. Enforcement remains active for any existing restricted rows even when the importer gate is off                                                                                     |
| Trusted plugins                      | Bundled issue/report consumers use the new boundary. Installed server plugins with raw tenant SQL remain privileged code, not sandboxed third parties                                                                                                        |
| Outbound effects                     | Broad webhooks/plugin events are suppressed for restricted or quarantined issue references, including secondary references. Queued issue email rechecks recipients and referenced keys at send time. Project websocket rooms carry content-free invalidation |
| Recurrence                           | Restricted issues do not spawn unrestricted recurring copies                                                                                                                                                                                                 |

Explicit destination audiences do not automatically synchronize Jira security-scheme members. Source level names are display labels, not authorization identities. Mapping does not grant project membership, an account, or edit permission. A changed or removed source level requires a separate issue review even if its new policy already has members.

The cross-worker slot intentionally serializes whole Jira jobs, including metadata work. This is conservative and bounds aggregate transfer memory, but independent tenants can wait longer. Increasing concurrency needs a measured operational configuration rather than removing the bound.

## Verification

All data and network destinations were disposable local fixtures. PostgreSQL 16 used port 55439, Redis port 55440, and Adobe S3Mock 5.2.3 port 55441. S3Mock exercises the actual AWS SDK multipart/range calls; it is not acceptance against the production object-store provider.

| Command / check                                                                                                 | Observed result                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm build`                                                                                                    | 21 tasks passed; existing large web-bundle warning                                                                                                                                                                     |
| `pnpm turbo typecheck`                                                                                          | 29 tasks passed                                                                                                                                                                                                        |
| `pnpm lint`                                                                                                     | No errors; 465 warnings remain                                                                                                                                                                                         |
| `pnpm --filter @weaver/api exec jest --runInBand`                                                               | 72 suites, 489 tests passed, including the final transfer and response-stream regressions                                                                                                                              |
| `pnpm --filter @weaver/api exec jest --runInBand attachment-transfer issue-reference attachment-download`       | 12 tests passed, including both additional transfer cases                                                                                                                                                              |
| `pnpm --filter @weaver/web exec vitest run --maxWorkers=2 --minWorkers=1`                                       | 72 files, 323 tests passed                                                                                                                                                                                             |
| Worker Vitest with `WEAVER_WORKER_TEST_REDIS_PORT=55440`                                                        | 7 files, 23 tests passed, including Redis disconnect/recovery; no skips                                                                                                                                                |
| `pnpm turbo test --filter=@weaver/jira-import --filter=@weaver/db --filter=@weaver/shared --filter=@weaver/sdk` | DB 105, shared 74, SDK 6 tests passed; Jira package tests are owned by the API suites, so its package script has no tests                                                                                              |
| Jira DB/runtime Jest with `--coverage`                                                                          | 20 tests passed; runtime 7 and fidelity 13. Follow-up fidelity run passed 14 with the additional persisted-orphan cleanup case                                                                                         |
| Full AppModule tenant/authorization E2E                                                                         | 29 existing tests passed; expanded authorization suite passed 19, including the new HTTP/API-key mapping and revocation case                                                                                           |
| Shared storage tests with `WEAVER_TEST_S3_ENDPOINT=http://127.0.0.1:55441`                                      | 12 tests passed, including Local/S3 stream, hash, range, multipart abort, cleanup and reference-suppression checks; no skips                                                                                           |
| Browser review                                                                                                  | Actual people, issue-security and recovery components rendered with synthetic data. Michael remained unselected and historical; audience review showed additions/count before Apply; review alone made zero API writes |

Jira fixture invocation:

```sh
WEAVER_IMPORT_TEST_DB=1 WEAVER_IMPORT_DATABASE=weaver_e2e_jira_import \
  pnpm --filter @weaver/api exec jest --config test/jest-jira.config.cjs --runInBand --coverage
```

Full-application E2E invocation:

```sh
WEAVER_E2E_DATABASE=weaver_e2e_jira_security \
WEAVER_E2E_DATABASE_PASSWORD=weaver_import_test \
WEAVER_E2E_DATABASE_PORT=55439 WEAVER_E2E_REDIS_PORT=55440 \
STORAGE_DRIVER=local ATTACHMENT_STORAGE_DIR=/private/tmp/weaver-jira-security-storage \
SMTP_HOST= SMTP_USER= SMTP_PASS= \
  pnpm --filter @weaver/api exec jest --config test/jest-e2e.config.js --runInBand \
  test/authorization-security.e2e-spec.ts test/tenant-security.e2e-spec.ts --testTimeout=60000
```

The full-project HTTP/Redis-worker fixture reconciled **2,441 issues, 7,523 comments, 1,345 attachments, 145 versions, three components, three sprints and two boards**. It verified no historical email, notification, account creation, or project-membership expansion. A debug invocation with a 20-second hook timeout failed during cleanup; the configured 60-second suite passed in about 150 seconds.

Large-file fixtures used the exact three reported EPD byte sizes: 220,230,420; 142,769,480; and 126,732,504. Additional tests covered empty and exact-cap files, metadata/actual overflow, truncation, stalled/cancelled readers, 429 recovery, permission denial, ranges, revocation during streaming, local failure cleanup, S3 multipart abort, and persisted orphan cleanup that preserves referenced attachments. A stalled-reader regression initially timed out; aborting the reader now terminates the transfer and cleans temporary storage.

The storage fixture streamed 0/100/250/512 MiB through both adapters with exact SHA-256 and byte-count checks. Across two recorded runs, peak process RSS was approximately 78–111 MiB for local storage and 131–157 MiB for S3, rather than increasing with the 512 MiB file size. This is a sampled local-process measurement, not production throughput, system-wide disk high-water measurement, or a resource guarantee.

Security fixtures cover admin override, mapped/unmapped readers, missing project access, removed membership, cross-tenant access, stale review revisions/counts, API-key readers, source restriction changes, source visibility loss, native secured children, numeric sorting across pagination, and revocation of issue/file/search/list access using existing credentials. HTTP tests also verify that attachment responses bypass JSON reference redaction rather than traversing the response stream.

Coverage from the Jira-only run: importer orchestrator 88.19% lines, issue-security reconciliation 94.73%, issue-access 88.23%, and migration 100% lines. That run alone does not include all fault tests or prove every branch; the separate unit and HTTP suites supply additional coverage. No claim of full CI or production acceptance is made.

## Release acceptance still separate

- Keep secured native imports disabled until the coordinated API/worker/plugin build and migrations are reviewed for deployment. An older API cannot enforce the new policies.
- Before any downgrade after native secured imports, quarantine affected projects, stop affected deliveries/jobs, and verify ordinary-user denial. Keep additive metadata and streaming downloads. A production backup/restore and rollback rehearsal has not been performed.
- EPD bytes, actual source/destination counts, production S3 behavior and video playback, production member mappings, and real notification/socket sessions remain live acceptance work. None was accessed or changed by these tests.
- Cloud is the first live acceptance target. Server/Data Center parity still requires representative version-specific source fixtures.
- Permission-aware reference filtering can remove text containing a hidden issue key. This favors confidentiality over showing a partial sentence. The global fallback also reads hidden issue identities per response; production-scale latency should be measured before raising concurrency or enabling broad deployments.

Local logs and the browser screenshot are under `/private/tmp/weaver-*.log` and `/private/tmp/weaver-jira-review-desktop.png`. The temporary browser fixture is removed after review; it is not product code.

The disposable Docker test services were stopped after verification. Their local containers/data were retained for repeat testing. The named browser session and Vite fixture server were closed.
