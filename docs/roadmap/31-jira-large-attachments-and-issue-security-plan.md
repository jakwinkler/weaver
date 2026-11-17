# Jira large attachments and issue security

**Status: Approved for local implementation and testing on November 16, 2026. No commit, push, deployment, or EPD reimport authorized.**

## Approved additions

- Make imported people discoverable from Users and import results, with a searchable list and clear distinctions between historical attribution, linking an existing member, and inviting a new member. Existing code places the list at Settings > Import / Export, below the Jira wizard. An imported person does not require an account: Michael Simmerson must retain attribution with no invitation or account creation. Account creation happens only when an explicitly invited recipient accepts; linking requires administrator review and an existing active member. Verify these paths locally without sending invitations.
- Default imported-project issue lists to descending numeric ticket key, such as EPD-100, EPD-99, EPD-9, across pagination. Respect an explicit column sort or manual order; preserve board/backlog rank and source timestamps. Ordinary non-imported projects retain their existing default ordering.

Prepared November 16, 2026 against local checkout `f0d7cae`, including the current working tree. Unrelated local edits exist and must be preserved. Production code and the latest EPD job have not been inspected directly. The prior investigation checked current Jira metadata for the five reported failures and traced their messages through local source.

## Outcome and decisions for review

Import the three oversized EPD videos, import EPD-31 and EPD-37 with their full readable content, and let an administrator explicitly map Jira issue security levels to Weaver members. Ordinary project members must never gain access merely because import completes.

Recommended decisions:

| Decision                     | Proposed behavior                                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Large-file allowance         | Configurable **512 MiB per imported attachment** by default. This covers all three reported videos.                                                                 |
| Transfer design              | Stream downloads, hashing, storage writes, verification, and destination downloads. Keep memory bounded independently of file size.                                 |
| Default secured-issue access | Import as a native issue visible only to organization owners/admins until explicitly mapped. Fetch the full readable comments, worklogs, history, links, and files. |
| Mapping scope                | Source instance + source project ID + security level ID. Select existing active Weaver members explicitly; names and email addresses never grant access.            |
| Permission composition       | Existing project permissions AND issue access AND any comment/worklog/file restriction. Mapping does not grant project membership or edit privileges.               |
| Administrator behavior       | Preserve the existing organization owner/admin override and administrator-only raw source archive.                                                                  |
| Reimport                     | Preserve approved mappings for an unchanged source identity. Restriction changes never silently broaden access.                                                     |
| Recovery                     | Add a narrow retry for selected failed attachments. Recover the secured issues through a reviewed full project reimport after permission support is verified.       |
| Release order                | Large-file support can ship independently. Issue security is enabled only after every supported access and delivery path is covered.                                |

These decisions were approved for local implementation and testing on November 16, 2026. Commit, push, deployment, production mappings, and customer-data reimports remain separate actions. See the [local implementation and verification report](../reviews/2026-11-16-jira-import-implementation.md) for results and remaining release acceptance.

## Evidence and behavior before implementation

| Reported item                                                                                                       | Source evidence                                                                                                | Current cause                                                                                            |
| ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Attachment 71865 on [EPD-10](https://rocketweb.atlassian.net/browse/EPD-10)                                         | `EPD_Customer Refunds.mp4`, 220,230,420 bytes, about 210.0 MiB                                                 | Hardcoded 100 MiB importer cap                                                                           |
| Attachment 71873 on [EPD-13](https://rocketweb.atlassian.net/browse/EPD-13)                                         | `Sending emails to multiple recipients.mp4`, 142,769,480 bytes, about 136.2 MiB                                | Same cap                                                                                                 |
| Attachment 71956 on [EPD-32](https://rocketweb.atlassian.net/browse/EPD-32)                                         | `Promotion - NetSuite (EPD_IDS) - Google Chrome 3_16_2021 10_20_33 AM.mp4`, 126,732,504 bytes, about 120.9 MiB | Same cap                                                                                                 |
| [EPD-31](https://rocketweb.atlassian.net/browse/EPD-31) and [EPD-37](https://rocketweb.atlassian.net/browse/EPD-37) | Security level ID `10000`, “Rocket Web Internal”                                                               | Importer archives the search payload and throws before native issue creation and child-resource fetching |

The pre-implementation source established:

- `packages/jira-import/src/jira-client.ts`: attachment responses are buffered, capped at 100 MiB, and use the common 30-second request timeout.
- `packages/server-common/src/outbound-http.ts`: crossing the streamed byte count produces the generic size-limit message.
- `packages/server-common/src/storage.ts` and `apps/api/src/core/storage/`: storage contracts accept and return whole-file buffers. Import verification also reads whole files.
- `apps/api/src/modules/attachments/attachment-download.controller.ts`: destination downloads load a buffer before sending it. Uploads have a separate `ATTACHMENT_MAX_BYTES` setting, defaulting to 10 MiB; changing that does not change the importer cap.
- `packages/jira-import/src/import-orchestrator.ts`: any nonempty `fields.security` triggers archive-only handling and project quarantine. Attachment failures also prevent the final quarantine-clear condition.
- `packages/jira-import/src/source-store.ts`: existing imported audience support recognizes role/group restrictions, not issue security levels.
- `apps/api/src/core/tenant/project-access.service.ts`: issue checks currently resolve to project access. Search also filters by accessible projects rather than issue audiences.
- `apps/api/src/core/websocket/websocket.gateway.ts`: project rooms can carry broadcasts, so checking REST routes alone would be insufficient.

Atlassian documents attachment byte ranges, and security-scheme member discovery requires Jira administration permissions and has project-type limitations. The implementation should work from security IDs observed on readable issues; optional scheme discovery must not become a mandatory elevated-permission requirement. References: [attachment API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-attachments/), [security level API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-security-level/).

## Phase 1: large attachments through the full file lifecycle

### Configuration and transfer

1. Introduce validated `JIRA_IMPORT_ATTACHMENT_MAX_BYTES`, default `536870912`. Keep interactive-upload limits separate and show the effective import limit in preview. Validate configuration consistently in API and worker; the worker enforces its actual limit even if a preview is stale.
2. Give attachments separate timeout settings. Proposed starting values: 30 seconds to receive response headers, 60 seconds without transfer progress, and 15 minutes total per attempt. Keep metadata requests at their existing limit. Measure and adjust these defaults in the disposable fixture before release.
3. Replace the importer buffer return with a streaming transfer interface. Count actual bytes and calculate SHA-256 incrementally. Reject oversized metadata before downloading, but always enforce the cap on actual bytes, including absent or misleading length headers. Validate the final count against Jira metadata when present.
4. Retain HTTPS, DNS pinning, private-address rejection, and credential isolation. Keep the current Cloud `redirect=false` path; do not add permissive credential-bearing redirects as a large-file workaround. Any supported redirect still passes the existing safe redirect checks.
5. Use backpressure and one active attachment transfer per import. Bound aggregate transfer concurrency across worker jobs/tenants, not only within a tenant. Abort network and storage work on cancellation, timeout, worker shutdown, or size overflow.

### Storage and downloads

- Add shared streaming read/write contracts and update the API storage facade to use them. Keep buffer methods for small existing callers, but remove them from import, reimport checksum verification, and attachment download paths.
- For local storage, write a private temporary file, verify length/hash, then atomically rename it. For S3, use a bounded multipart upload with explicit completion/abort. Verify the SDK behavior against the installed version before choosing the implementation.
- Commit the native attachment and import record only after a complete verified object exists. If the database transaction fails, remove only the newly created object. Track temporary ownership so crash recovery can clean incomplete multipart uploads and temporary/orphaned objects without touching referenced files or other live jobs.
- Stream authenticated destination downloads and support a single HTTP byte range for video seeking. Apply issue and file access checks before opening the object, including HEAD/range requests. Return correct 206/416 responses; preserve MIME and response security headers. Do not expose durable public storage URLs.
- Keep completed bytes behind Weaver's access checks. Revocation blocks subsequent requests and range requests; bytes already delivered cannot be recalled. Recheck access periodically during long transfers and abort ongoing transfers after revocation is detected, using a documented bounded interval.

### Recovery and reporting

- Report structured failure codes plus issue key, attachment ID, filename, expected/received bytes, effective limit, and retry eligibility. Do not log signed URLs, credentials, or attachment contents.
- Retry transient transport errors, 429, and appropriate 5xx responses at most three total attempts with backoff and bounded Retry-After handling. Do not automatically retry permission failures, size-policy failures, or integrity mismatches. Start each attempt from zero; resumable downloads are out of scope for this first version.
- Persist failed attachment descriptors linked to their source issue and job. Add an administrator action to retry a selected set under the existing organization import lock, with newly supplied credentials sealed using the existing mechanism. Re-fetch current source issue security and attachment metadata before transfer; quarantine on unresolved or changed visibility. Do not trust an archived URL as proof of access.
- Existing reports contain only attachment IDs. Resolve those through archived issue metadata and fresh source reads; if a trustworthy association cannot be established, require a normal reviewed reimport instead of guessing.
- Successful retries update a linked recovery report while preserving the original job report. They do not refresh unrelated issues, reset access reviews for unrelated files, or clear project quarantine. Newly recovered files retain the existing administrator-only file-review default.

## Phase 2: explicit issue security policies

### Data model and administrator review

Use a dedicated tenant-local issue access policy table rather than treating a security level as a comment group. Proposed fields: internal UUID, canonical source instance, source project ID, security level ID/name, selected active member IDs, review state, revision, reviewer, and reviewed timestamp. Enforce uniqueness on the three source identifiers. Preserve optional source scheme metadata for review, without depending on scheme membership discovery.

Add an issue policy reference and explicit access state: unrestricted, restricted, or quarantined. A restricted issue with a missing policy, an empty/unreviewed audience, or an invalid reference remains administrator-only. Add a separate last-verified source restriction snapshot so observed Jira changes are distinguishable from the currently approved destination policy.

Extend the existing import administration UI with “Issue security levels.” For each level, show source project, name/ID, affected issue count, review state, and selected members. Saving presents the exact member additions/removals and affected issue count; server-side application checks the reviewed revision to prevent stale approvals. Log the actor, before/after mapping, and affected scope. Restriction names are labels, never identifiers or automatic matches.

Mapping an audience grants access only where the member already has project access. Explain which selected users currently lack that access. Invitations, source author linking, assignee changes, and matching email addresses do not modify the policy. Empty membership is a valid explicit “administrators only” decision, distinguishable from an unreviewed policy.

This is an explicit destination audience, not automatic replication of every Jira security-scheme rule. Dynamic Jira rules such as reporter/assignee membership are not translated in this phase. Missing or unsupported security identity stays quarantined. Cloud is the first live acceptance target; Server/Data Center needs version-specific fixtures and representative acceptance before claiming equivalent support. Existing Server imports must remain fail-closed.

### One issue access rule across all surfaces

Implement a shared issue authorization service and matching query predicate. Evaluate current tenant membership and project rights, then the issue policy, then any narrower child restriction. Apply filtering before pagination, totals, aggregates, and search limits. Writes require the same visibility plus existing write permissions. Cross-project moves, copies, recurrence, and bulk operations must preserve restrictions or reject the operation; no implicit policy stripping.

Build an endpoint/consumer inventory with a regression test for every relevant path before enabling secured native issues:

| Surface                       | Required enforcement                                                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Direct issue reads and writes | Keys, UUIDs, single/bulk operations, status changes, assignments, moves, copies, recurrence                                                                  |
| Lists and derived views       | Search, boards, backlog, roadmaps, sprint/velocity/burndown, issue counts, time reports, exports                                                             |
| Relationships                 | Parent/subtask, epic, related links, selectors, activity text and rich content referencing hidden issues; do not leak hidden issue titles/keys through joins |
| Child resources               | Comments, replies, attachment metadata/download/delete/inline media, worklogs/time entries, Jira details/history/remote links                                |
| Live events and notifications | Restrict recipients before websocket emission; recheck notification list/count and email delivery after revocation; suppress stale queued deliveries         |
| Automation and integrations   | API keys, webhooks, scheduled jobs, plugin issue APIs and plugin report handlers; require an explicit actor or privileged internal context                   |
| Caches and browser state      | Revision-aware invalidation, clear restricted content on access changes, and recheck existing websocket subscriptions                                        |

Project-room broadcasts cannot contain restricted issue payloads. Use authorized per-user delivery or content-free invalidation followed by authorized fetching. Background jobs must resolve current access at execution time. Suppress content-bearing webhooks for restricted issues unless their destination has an explicit approved policy; broad project webhook subscriptions are insufficient.

Installed trusted server plugins can access raw tenant SQL. They are privileged application code, not isolated untrusted clients. Audit bundled issue/report consumers and their response paths; document the trusted-plugin boundary. Do not claim arbitrary third-party plugin isolation without a separate sandbox design. Any uncovered consumer blocks issue-security enablement.

### Import, reimport, and quarantine

1. Install permission enforcement before allowing the importer to create secured native issues. Create/update a restricted issue atomically with its policy and access state, before children are written. No transient unrestricted row may be visible.
2. Import full readable child collections for both mapped and unmapped levels. Keep archive records administrator-only. Preserve narrower comment/worklog restrictions and the existing explicit file-access review, including on mapped issues.
3. For existing `secured_issue` records, retain the archive, re-fetch source data, create/update through the existing source ID mapping, and link the archive to the native issue. Treat historical secured records as reconciled when a verified native record exists so they do not keep triggering the old missing-source check. Do not present the old search payload as a complete backup.
4. On a stable level/project/source identity, retain the approved policy across reimports. Renames update the display label without widening access. Membership changes are Weaver administrator decisions, not automatically inferred Jira synchronization.
5. A new or changed source level quarantines the affected issue pending review, even if that target level already has a mapped audience. Explicitly removing security in Jira also requires review before broadening Weaver access. Missing/ambiguous security fields and unreadable source issues never become unrestricted by default.
6. Preserve project quarantine while a full source visibility check is running or unresolved. Only relax it after complete reconciliation proves every formerly visible issue is accounted for and every restricted native issue is protected. Known secured issues can then remain individually restricted while ordinary project members see unrestricted issues. A partial date-window import or selected attachment retry cannot establish this.
7. Separate fidelity failures from visibility failures in the report. An isolated oversized file may leave the job in `needs_review` without forcing project-wide quarantine once visibility is independently established. An inaccessible source issue or unknown restriction remains a visibility blocker.

Migration is additive and must cover both existing tenant schemas and new-tenant provisioning. Never backfill imported issues as unrestricted merely because their existing row lacks security metadata. Preserve current quarantine for legacy uncertain records until a full reimport establishes their state. Existing unrelated native issues retain their current access behavior.

## Phase 3: verification and acceptance

Write regression tests that demonstrate the old failures before changing behavior. Use the real byte-limit and access implementations, with coverage confirming those paths execute. Fixtures must be local and isolated; SMTP and webhooks go only to local sinks.

| Area                 | Required evidence                                                                                                                                                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Large files          | Deterministic streamed fixtures at the three EPD sizes; exact cap, cap + 1, empty, missing length, incorrect metadata, truncated stream, slow transfer, timeout, 429, cancellation, restart, and storage/DB failures                   |
| Resource bounds      | Local and S3-compatible integration runs; measure peak process memory and disk use for 100/250/512 MiB files and concurrent jobs. Verify memory does not grow proportionally with file size, and incomplete objects are cleaned safely |
| Integrity and replay | Exact SHA-256 and byte counts, interrupted transfer leaves no published attachment, repeated retry creates no duplicates, legacy checksum verification streams, unrelated file reviews remain unchanged                                |
| Downloads            | Authorized full/HEAD/range requests, video seeking, invalid ranges, denied and revoked users, cancellation after revocation, no public object access                                                                                   |
| Security matrix      | Owner/admin, mapped member, mapped viewer, unmapped project member, mapped user without project access, inactive member, cross-tenant user, and API-key actor                                                                          |
| Disclosure checks    | Every surface in the inventory, including counts/aggregates, nested relationships, notifications, queued email, connected sockets, webhooks, plugins, and raw source endpoints                                                         |
| Restriction changes  | Rename, new level, level switch, removed/omitted security, unreadable/deleted source issue, project move, same level name in two projects/sites, member removal and demotion with existing sessions                                    |
| Upgrade and recovery | Migrate legacy schemas, new-tenant provisioning, existing native copies, archive reconciliation, concurrent migration startup, full and partial reimports, cancellation/restart, rollback rehearsal                                    |

Run focused unit and integration tests during each phase, then the repository's build, lint, typechecks, API/web/worker suites, dedicated Jira database/runtime integration suites, and browser access tests before release. Add meaningful S3-compatible streaming and large-file tests to CI; the existing Jira fixtures alone do not establish production throughput. Record exact commands, revisions, failures, and any skipped coverage. Local implementation checks and their results are recorded in the linked verification report. Production acceptance has not been performed.

Acceptance for the reported EPD case, after separate authorization to use the live source/destination:

1. Identify the exact tenant, project, latest job ID, deployment revision, storage configuration, and approved member list. Capture a read-only baseline and reviewed affected-record diff.
2. Demonstrate local isolated acceptance first. For any real-data destination changes, take coordinated database/storage backups and prove the restoration path before proceeding.
3. Recover attachments 71865, 71873, and 71956; verify complete bytes, SHA-256, downloads, and video range playback. Live source hashing requires reading the files and should be recorded as part of this acceptance scope.
4. Reimport EPD-31 and EPD-37 as restricted native issues. Compare readable source child counts and contents, including attachment 71958 on EPD-31 and 71967 on EPD-37. Check a mapped staff member and an unmapped project member across the disclosure inventory.
5. Revoke access, verify existing sessions and queued delivery, then repeat the import and retry to prove no duplicates or access widening. Clear project quarantine only when the documented full-pass conditions are met.

## Release and rollback

Deliver attachment support first if desired; security enforcement, mapping UI, and secured native imports form one gated release. Keep the security feature disabled until all relevant API/worker/plugin versions and migrations are installed and verified. Drain old jobs/processes before enabling it.

An older API would not enforce new issue policies. A code-only rollback after secured issues become native is unsafe. Before downgrading, quiesce processing, quarantine every affected project using the legacy-compatible project flag, verify ordinary users are denied, and suppress affected outbound delivery. Restore the coordinated backup if required. Keep additive security metadata rather than dropping it as part of rollback.

Large-file rollback disables new oversized imports/retries and preserves completed objects. Keep streaming downloads available while such files exist; rolling the download path back to whole-file buffers would reintroduce memory risk. Do not delete successfully imported files as an automatic rollback action.

No automatic destructive rollback is proposed. Prepare exact commands, affected counts, backup locations, inverse operations, and checks for review at deployment time.

## Scope and implementation sequence

1. **Large files:** streaming storage contract, importer transfer, streamed downloads, limits/timeouts, failure reports, selected-file recovery, and regression coverage.
2. **Issue enforcement:** additive schema, shared read/write predicates, query filtering, all child and derived surfaces, and outbound delivery controls. Keep secured imports disabled.
3. **Mapping and reconciliation:** administrator review UI/API, full secured native imports, legacy archives, reimport transitions, and independent fidelity/visibility outcomes.
4. **Release evidence:** migration/rollback rehearsal, full verification matrix, documentation, and a concrete deployment/EPD recovery proposal for approval.

Automatic Jira security-scheme synchronization, generalized destination ACL editing, importing unreadable Jira data, resumable chunk downloads, and increasing interactive upload limits are outside this proposal. This work adds a complete issue permission boundary; it is materially larger than removing the two importer checks.
