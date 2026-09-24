# Review resolution, September 23, 2026

The source review targets commit `27b14d72ab8d201c4bf4fcbffd00830091dd21ce`. Fixes are isolated in `.worktrees/review-2026-09-23` at that exact baseline. The original checkout, its unrelated changes, and the original review were preserved. At the end of local review, nothing had been committed, pushed, or deployed. Matt subsequently authorized committing these fixes, deploying them to weaver.usercore.com, and running functional acceptance there.

“Fixed” below means implemented and locally checked, not production accepted. “Partial” and “deferred” remain open. Operational changes and rollback requirements are in [the rollout notes](docs/security/review-2026-09-23-rollout.md).

## High findings

| ID | Disposition | Result |
|---|---|---|
| H1 | Fixed | Attachment deletion resolves the route issue and requires the attachment to belong to it. A mismatched request returns 404 without deleting the file. |
| H2 | Fixed | Relations check both issues on mutations; search/list filter inaccessible projects. SDK access helpers make the checks explicit. |
| H3 | Fixed | Jira uses the shared safe outbound transport, pins validated DNS addresses through connection establishment, rechecks redirects, strips cross-origin credentials, limits JSON/download bodies, and omits upstream error bodies. Private-network Jira servers require a separately designed allowlist; unrestricted private fetches are intentionally rejected. |
| H4 | Fixed at broker boundary | Kubernetes Redis requires authentication; NetworkPolicies restrict ingress. Automation/import jobs validate tenant schema names and bind tenant/schema in the database. Import jobs are authenticated encrypted payloads. Redis remains a trusted infrastructure boundary, not a sandbox for arbitrary attacker-controlled jobs. |
| H5 | Fixed | Web maps to 8080, Redis password is required and its health check authenticates, refresh secret is required separately. API/web/worker Dockerfiles build successfully. |

## Medium security findings

| ID | Disposition | Result |
|---|---|---|
| MS1 | Fixed | Delegated role managers cannot edit their own/system roles, create reserved roles, or grant wildcard/admin/otherwise unheld permissions. Seeding is administrator-only. |
| MS2 | Fixed | One shared outbound implementation pins validated addresses in an Undici dispatcher. IPv6 translation ranges are blocked. Redirect credentials and response bodies are bounded. |
| MS3 | Fixed for sensitive routes | Auth/public routes and API-key rate limiting fail closed with 503. Proxy trust is explicit. Login/registration also use account buckets. Ordinary authenticated traffic retains fail-open availability behavior. |
| MS4 | Partial | Settings responses and lifecycle responses mask secrets; masked/blank saves preserve them. Bitbucket URL tokens are replaced by provider HMAC. PostgreSQL settings encryption remains open because it requires key management, backfill, rotation, and rollback. |
| MS5 | Fixed | Time capability writes check every target issue against the current user's project access. Candidate reads are filtered. |
| MS6 | Fixed | Time-report aggregation/export uses accessible-project constraints. CSV formula prefixes are escaped. |
| MS7 | Fixed | Checklist listing uses `summary`, scopes projects, and bounds pagination. |
| MS8 | Fixed | Scheduled query fan-out refuses more than 100 matches before any actions run. It does not silently truncate or repeatedly process the first 100. |
| MS9 | Fixed | Imported users match only tenant members. Queue payloads are encrypted with a dedicated key. Attachments use bounded downloads and the same storage adapter as the API. Historical attachment repair remains an explicit migration task. |
| MS10 | Contained; migration work deferred | Production provisioning requires explicit operator opt-in and only synchronizes a newly created schema. A versioned tenant-schema migration system is still needed. |
| MS11 | Fixed | Data-service ports bind loopback, Redis credentials are wired through templates, dev secrets are Secrets, and base/overlay expectations are documented. |
| MS12 | Fixed | Avatar buffering is capped at 5 MB; accepted image signatures are PNG/JPEG/GIF/WebP. |
| MS13 | Fixed | Project roles, user IDs, team IDs, plugin IDs and batch sizes are validated; project/team additions require current tenant membership. A last-project-lead invariant was not invented: tenant administrators retain management access. |

## Medium functional findings

| ID | Disposition | Result |
|---|---|---|
| MB1 | Fixed | Repository handlers use the actual request/context contract, validate URLs and scope deletes. Version 1.0.1 supplies the missing migration and triggers upgrades of existing records. |
| MB2 | Fixed for new/current storage | API/import worker share local/S3 implementations and paths. Compose shares uploads; Kustomize supplies a shared RWX PVC; Helm requires an existing shared claim. Existing records/files need migration checks before rollout. |
| MB3 | Fixed with explicit supported scope | Helm supports external PostgreSQL/Redis and requires their hosts/credentials plus an uploads claim. Unsupported bundled-service flags fail clearly. The web upstream follows the Helm release-specific service name. Render and lint pass; no cluster installation was performed. |
| MB4 | Fixed | Active profile avatars can be read by other members of the same tenant. Other unlinked uploads remain uploader-only. |
| MB5 | Fixed | Valid calendar dates and a 366-day maximum bound sprint report allocation. |
| MB6 | Fixed | Root React error boundary keeps reload/home recovery visible after a render exception. |
| MB7 | Fixed | Calendar dates are parsed locally without UTC date shifts; day differences use calendar arithmetic across DST. |
| MB8 | Fixed | Aggregate views and exports follow actual page metadata with cancellation and explicit incomplete/overflow errors. |
| MB9 | Fixed | Issue deletion/bulk deletion, API-key create/delete and import start/cancel now create audit records; returned API-key secrets are excluded. |
| MB10 | Fixed behavior; refactor unnecessary | Redis errors are handled and default ports aligned. A repository-wide connection-factory rewrite is not needed for these fixes. |

## Low and informational findings

| ID | Disposition | Reason or result |
|---|---|---|
| L1 | Fixed | Missing/non-password accounts perform a dummy bcrypt comparison; membership failures use generic invalid-credential text. |
| L2 | Fixed | OIDC requires `email_verified === true`. |
| L3 | Partly reject; configuration follow-up | An evergreen opt-out link has deliberately narrow authority; expiry would break old unsubscribe links. A mandatory independent signing key needs a planned transition preserving existing links. |
| L4 | Ignore as a vulnerability | Global-provider SSO for verified existing members is a product policy, not an access bypass. Do not change defaults without an organization policy decision. |
| L5 | Defer feature | Password reset/change needs a complete token, recovery, mail and session-revocation design. Absence of a feature is not an exploit to patch here. |
| L6 | Fixed | Sort whitelist is mandatory, and an empty whitelist permits no raw sort field. |
| L7 | Fixed | Notification paging uses schema validation while preserving its existing default of 20. |
| L8 | Fixed | Manual time entries are capped at 1,440 minutes. |
| L9 | Fixed | Sprint issue batches are capped at 100. |
| L10 | Fixed | Reorder IDs are deduplicated before existence checks. |
| L11 | Fixed | Transition ID is a required UUID. |
| L12 | Fixed | Organization slugs are capped at 56. |
| L13 | Fixed | Auth/public middleware paths and refresh-cookie paths respect API_PREFIX. |
| L14 | Fixed | Conflicting API_PUBLIC_URL and unused expiry examples removed. |
| L15 | Fixed misleading UI | Removed the nonfunctional allowed-domain editor. Existing stored values are retained; domain-based enrollment policy is not silently invented. |
| L16 | Ignore unused method | No production caller invokes emitToTenant. Current project-scoped events deliberately avoid tenant-wide rooms. Joining all sockets would risk exposing private-project events. |
| L17 | Fixed | WQL length/condition caps and one batched status lookup replace sequential lookups per condition. |
| L18 | Fixed | Default-workflow changes use a tenant transaction and advisory lock. Reproduced both loss of the default on failed save and multiple defaults under concurrency; both regression checks now pass. Direct privileged SQL still needs its own invariant discipline. |
| L19 | Defer history migration | Name-based sprint reconstruction is real. Stable ID-based activity history needs compatible writes/readers and a strategy for ambiguous historical rows; renaming old history blindly would corrupt reports. |
| L20 | Ignore blanket prohibition | Reverse links and cycles need relation-specific semantics. A general cycle ban would change legitimate relates/duplicates behavior without an agreed rule. |
| L21 | Defer rule contract | Arbitrary custom-field validation JSON has no specified rule language. Define supported rules and legacy-data behavior before enforcing it. Current type validation remains. |
| L22 | Defer timezone/data work | Tenant-timezone reporting and the activity-ID query need a separate change. Legacy timestamp columns also require UTC server operation today. |
| L23 | Fixed | Saved query length is capped at 10,000. |
| L24 | Fixed | Avatar URL length and relative/http(s) schemes are checked. |
| L25 | Defer retention policy | Page versions are user history. Do not delete them to satisfy an arbitrary retention cap; pagination and an explicit retention policy should be designed separately. |
| L26 | Fixed | Formula-like CSV cells are prefixed safely in audit, issue and time-report exports. |
| L27 | Ignore | Returning a newly generated webhook secret once is necessary for receiver setup. List/update responses already omit it. Renaming the one-time field provides no security benefit. |
| L28 | Defer integration feature | Automation HTTP actions are generic calls; mandatory HMAC would require a configured secret and a receiver contract. Registered webhooks already support signed delivery. |
| L29 | Ignore unverified replacement | The pinned Nodemailer code strips CR/LF. A local stream-transport probe with malicious from-name/subject values did not create a Bcc header; no mail was sent. Do not add competing header encoders. |
| L30 | No demonstrated vulnerability | Existing length/parser validation rejects adversarial inputs; added bounded tests complete in milliseconds. Keep tests, do not claim a cron DoS without a reproducer. |
| L31 | Fixed | Routes requiring permissions reject missing authentication before role lookup; missing role fails closed. |
| L32 | Ignore normalization-only claim | Empty/encoded segment behavior is consistent between matching and authorization, and the report establishes no traversal or privilege bypass. |
| L33 | Fixed | Dev asset redirects must stay on the configured origin; backslashes are rejected. |
| L34 | Fixed | Invalid installed versions are isolated per plugin; upgrade log retains only 100 records. |
| L35 | Fixed | Companion and event contexts receive manifest defaults consistently. |
| L36 | Fixed documentation | Trusted server plugins can execute arbitrary code/SQL. Docs now say so; search_path is not a security sandbox. RLS alone cannot sandbox server plugins. |
| L37 | Ignore as escalation | API-key scopes restrict the issuing user's existing authority. An admin scope does not bypass membership or permission checks. Renaming it would only break clients. |
| L38 | Defer browser suite overhaul | The old Playwright suite still needs current selectors/fixtures and CI orchestration. Manual browser acceptance and current component tests were run; this is not a claim that the old suite now passes. |
| L39 | Ignore as data exposure | The localStorage marker affects shell presentation. API authorization still blocks data and mutations without a valid session. A session-loading UX redesign is separate. |
| L40 | Fixed | Default API base is same-origin; socket origin uses URL parsing. Vite has matching local proxies. |
| L41 | Fixed | Attachment, avatar, icon and editor upload failures now show errors; rejected async uploads are handled. |
| L42 | Fixed | Progress commits on release/blur, deduplicates the same commit, shows failures and restores the saved value. |
| L43 | False positive | Generic issue PATCH already calls performTransitionInManager and enforces workflow transitions. Replacing the board request is unnecessary. |
| L44 | Fixed | SCM anchors accept only credential-free http(s) URLs. |
| L45 | Fixed | Gravatar is opt-in; initials are the default. |
| L46 | Defer deployment policy | CSP must be tested against production plugin federation, image origins, sockets and embeddable public forms. No blanket CSP was added that could break those surfaces; this remains defense-in-depth work. |
| L47 | Fixed | Form names are escaped before inclusion in copied iframe HTML. |
| L48 | Defer UX | Return-path and cross-tab logout coordination are useful improvements, not an authorization fix. |
| L49 | Fixed | CI actions resolve to official immutable commit SHAs, permissions are read-only, checkout credentials are not persisted, and a scheduled production dependency audit fails on high severity. |
| L50 | Fixed | Node 22 is consistent in engines, nvm, CI and Docker; Docker pnpm matches packageManager. |
| L51 | Fixed | Production API/worker startup rejects absent or default data-service credentials before work begins. |
| L52 | Defer measured migration | Index additions need representative query plans, migration/lock analysis and existing-schema rollout. Do not silently synchronize live tenant schemas. |
| L53 | Fixed | PostgreSQL PVC mount uses a data subdirectory. |
| L54 | Fixed | Production Kustomize removes fixed replica counts from HPA-managed deployments. |
| L55 | Partly fixed; dead names ignored | Event logging no longer prints job payloads. Unused queue names have no execution path and can remain until their associated feature decisions. |
| L56 | Verified and updated | Current registry audit found advisories missed by the offline review. Compatible dependency patches reduce 13 advisories, including one high, to four moderate advisories; none high/critical. Remaining affected APIs are not used by current app code. Details below. |

## Dependency audit limitations

Targeted overrides update adm-zip, qs, body-parser, PostCSS and webpack. The remaining audit findings are tracked, not globally suppressed:

- Two file-type parser advisories, including [ZIP decompression limits](https://github.com/advisories/GHSA-j47w-4g3g-c36v), enter through Nest's optional file validator. Weaver does not use FileTypeValidator or file-type; avatar checks use bounded byte signatures. A supported Nest/file-type upgrade is separate.
- [Nest SSE injection](https://github.com/nestjs/nest/security/advisories/GHSA-36xv-jgw5-4q75) concerns user-controlled SSE type/id. No SSE endpoint is present. Upgrade the Nest family together rather than forcing Nest 11 core under Nest 10 adapters.
- [UUID buffer bounds](https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq) concerns v3/v5/v6 with caller-provided buffers. The affected transitive Nest TypeORM helper uses v4 without a supplied buffer.

The SAML package is at 5.1.0 with the [advisory-family fixes](https://github.com/node-saml/node-saml/security/advisories/GHSA-4mxg-3p6v-xgq3). No audit finding justifies replacing passport-github2 solely because its version is old. These are point-in-time reachability judgments; re-evaluate if affected APIs are introduced.

## Verification

All commands ran from the isolated worktree against disposable local services.

| Check | Result |
|---|---|
| `pnpm exec turbo run build typecheck test --concurrency=2` | 49/49 tasks pass. Unit/component totals: API 200, web 150, worker 10, shared 63, database 95, SDK 5, CLI 6, automatic-time evaluation 5, server-common 4. |
| `pnpm lint` | Exit 0, no errors, 312 warnings. Warnings remain; this is not a warning-free codebase. |
| `TZ=UTC WEAVER_E2E_DATABASE=weaver_e2e_review_final WEAVER_E2E_DATABASE_PORT=55441 WEAVER_E2E_REDIS_PORT=56391 STORAGE_LOCAL_PATH=/tmp/weaver-review-20260923-uploads pnpm --filter @weaver/api exec jest --config test/jest-e2e.config.js --runInBand --forceExit` | 344/344 tests, 40/40 suites pass. |
| Focused authorization-security/plugin-settings integration run after the final mask change | 22/22 pass. |
| Failing-first regressions | Attachment binding, plugin authorization, role delegation, fail-closed limiting, outbound IPv6/DNS handling, sprint dates, foreign membership, local dates/pagination, progress-save behavior, WQL bounds, workflow rollback/concurrency, and password masking observed failing before their fixes. |
| Three `docker build -f docker/Dockerfile.{api,web,worker}` builds | Pass. Final API and web images rebuilt after their last runtime changes. The main Compose multistage Dockerfile was updated but not separately rebuilt. |
| Web image runtime | Nginx listens on 8080, configurable release-specific API upstream renders correctly, `nginx -t` passes, web and proxied API health both return HTTP 200. |
| Compose config and OAuth mapping | Both Compose files validate; all five existing OAuth/deployment contract tests pass. |
| Helm/Kustomize | Helm lint passes and renders with explicit external hosts/secrets/PVC. Both Kustomize overlays render. Rendered Helm upstream matches the API service. No cluster installation was performed. |
| Named browser session at 1920x1080 | Registration, project creation, issue creation and progress update succeed. After reload, API and UI both show 5 percent. No browser errors or Gravatar requests. Screenshot inspected. |
| Outbound HTTP | A real pinned-DNS HTTPS request returns HTTP 200 with successful TLS hostname verification and bounded body reading. Redirect/blocklist tests also pass. |
| `pnpm audit --prod --json` | Four moderate advisories, zero high/critical, down from 13 total with one high. Audit exits nonzero for the documented remaining moderate findings. |
| `git diff --check` | Pass. |

Earlier acceptance attempts found and corrected real failures and test assumptions: notification default paging, a hardcoded Redis test port, UTC legacy timestamp parsing, and a stale webhook mock. A transient socket interruption passed on rerun; the final full API suite passed without retry masking. The OAuth suite still logs an asynchronous audit attempt after its synthetic tenant schema is removed; its assertions pass. No claim is made that all teardown warnings are resolved.

Not exercised: the stale standalone Playwright suite, a production Kubernetes cluster, a real S3 account, full Jira import against a real provider, or deployment acceptance. Sensitive rollout prerequisites remain open as described above. Temporary browsers, API/frontend processes and review containers are removed after acceptance; Docker build cache is left untouched to avoid pruning unrelated work.
