# Automatic Time Plugin

> Turn local work context into private, issue-aware draft time, then let the user review and release the official record.

## Status

- Phases 0, 1, and 2 complete; Phase 3 not started
- First user: Matt, single-user workflow
- Initial platform: macOS
- Distribution: bundled first-party plugin, disabled by default
- Companion: separately installed macOS menu bar application owned by the plugin

## Outcome

Weaver should make manual timers exceptional. It should observe lightweight work metadata locally, group that evidence into useful activity drafts, suggest the most likely Weaver issue, learn from corrections, and create official time entries only after explicit user release.

The system has three ownership boundaries:

| Boundary                        | Owns                                                                                                                         |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Weaver core                     | Official time entries, issue and project relationships, permissions, billing locks, audit events, stable plugin capabilities |
| `@weaver/plugin-automatic-time` | Private drafts, issue suggestions, correction memory, review, release orchestration, device management                       |
| macOS companion                 | Metadata capture, encrypted raw evidence, segmentation, local inference, retention, resilient sync                           |

The plugin is more than the AI component. It owns the complete automatic-time experience. AI is one bounded step inside its assignment pipeline.

## Product Decisions

These decisions are settled for the first version:

- The primary value is avoiding timers and automatically assigning work to Weaver issues.
- The first version is for one person, not a manager or team workflow.
- Weaver should try to assign every activity to an issue.
- When there is no clear match, Weaver should preserve an intelligent private draft and allow manual assignment later.
- Manual assignment should improve future automatic assignment.
- Capture starts with metadata, Git, and Weaver context.
- Raw evidence uses encrypted local storage with short retention.
- The experience includes both a live Drafts timeline and an end-of-day Daily Review.
- Deterministic evidence runs before AI clustering or semantic matching.
- Every suggestion includes confidence and reasons and remains editable.
- User release is sufficient. There is no manager approval in the first version.
- Released time remains editable until a future billing system locks it.
- This initiative covers time tracking, not project financials, payroll, rates, or billing UI.

## Proposed Defaults

These defaults should be validated during the first local trial. They are not reasons to delay the first vertical slice.

- Raw-signal processing and inference run locally.
- Raw signals are deleted 48 hours after the associated day is released and never retained longer than seven days.
- Context switches shorter than two minutes are folded into surrounding activity unless they contain a strong issue signal.
- Confidence of 0.90 or higher assigns a private draft automatically.
- Confidence from 0.65 through 0.89 presents a prominent suggestion.
- Confidence below 0.65 leaves the draft unassigned.
- Unassigned work cannot be released until it is assigned, hidden, or deleted.
- The first candidate set contains open issues assigned to Matt, issues viewed or changed recently, and issues in the repository-mapped project.

## Non-Goals

- Screenshots or screen recording
- Keyboard contents, clipboard contents, or file contents
- Meeting audio or transcription
- Employee monitoring or manager visibility into private drafts
- Windows, Linux, iOS, or Android companions
- Manager approval workflows
- Rates, invoices, payroll, budgets, or billing interfaces
- Automatic issue creation
- Automatic release
- A third-party plugin marketplace
- Completing all Plugin System v2 roadmap work before this feature can ship

## Product Invariants

1. Raw signals never leave the companion.
2. Private drafts are visible only to the owning user.
3. Device credentials cannot release official time.
4. No time becomes official without an interactive user release action.
5. A retry cannot create duplicate official entries.
6. Disabling the plugin stops capture sync and removes its UI without breaking manual time tracking.
7. Uninstalling the plugin preserves official time entries.
8. Locked official entries cannot be changed, reopened, or deleted by the plugin.
9. Assignment always reports confidence and human-readable reasons.
10. Correction memory is inspectable, reversible, and scoped to one user.

## Relationship to Existing Roadmap Work

Automatic Time should build on the existing plugin roadmap without taking a dependency on the entire Plugin System v2 milestone.

- `18-dynamic-plugin-loading.md`: not required for the first-party bundled release. Add the plugin to the existing build-time importer initially. Migrate it when dynamic loading is implemented.
- `19-plugin-settings-ui.md`: use a plugin-owned settings page for the first version. Reuse the generic settings renderer later.
- `21-plugin-upgrades.md`: Automatic Time needs versioned, fail-closed migrations before storing user drafts. Implement the minimum shared upgrade path required by this plugin.
- `26-api-keys.md`: do not expose a broad personal API key to the companion. Implement narrow device pairing and device-scoped credentials.
- `28-audit-log.md`: emit plugin install, device pair or revoke, release, reopen, and lock events so the later tenant audit log can consume them.

## End-to-End Flow

1. The user installs and enables Automatic Time in Weaver.
2. The plugin page offers the signed macOS companion and starts a short-lived pairing flow.
3. The authenticated Weaver user approves the device.
4. The companion stores its revocable device credential in macOS Keychain.
5. The companion downloads a bounded issue-candidate snapshot and correction rules.
6. Local collectors record permitted metadata into an encrypted local event store.
7. The local segmenter turns signals into activity blocks.
8. The assignment engine scores candidate issues and records confidence and reasons.
9. The companion syncs derived private drafts, never raw signals.
10. The Drafts page shows the live timeline and allows corrections.
11. Daily Review requires every draft to be assigned, hidden, or deleted.
12. Release submits an idempotent batch through the plugin.
13. Weaver core atomically creates official time entries.
14. The plugin records the release mapping and teaches correction memory from confirmed changes.
15. Existing issue history and time reports show the released entries.

## Core Worklog Foundation

The existing `time_entries` table remains the canonical official record. Private drafts do not belong in this table.

### Core schema changes

Add nullable or backward-compatible fields through a tenant migration:

| Field              | Purpose                                               |
| ------------------ | ----------------------------------------------------- |
| `started_at`       | Optional beginning of the official work interval      |
| `ended_at`         | Optional end of the official work interval            |
| `source`           | `manual`, `timer`, or `plugin`                        |
| `source_plugin_id` | Plugin responsible for a plugin-created entry         |
| `source_reference` | Plugin-owned idempotency reference                    |
| `locked_at`        | Time the entry became immutable                       |
| `lock_reason`      | Human-readable reason, initially reserved for billing |
| `updated_at`       | Last official edit timestamp                          |

Add a partial unique index for `source_plugin_id` plus `source_reference` when both are present. Preserve the existing `minutes`, `description`, `logged_at`, `issue_id`, and `user_id` contract.

### Core behavior

- Existing manual entry and timer endpoints remain backward compatible.
- Update and delete reject locked entries.
- Plugin-created entries require a declared plugin capability.
- Batch creation is transactional and idempotent.
- Core, not the plugin, enforces issue existence, user ownership, tenant isolation, and lock state.
- Core emits `time.logged`, `time.updated`, `time.deleted`, and `time.locked` events.
- A billing system may lock entries later, but billing UI and billing calculations are outside this plan.

### Stable plugin capabilities

Extend `PluginCoreApi` with typed methods instead of allowing the plugin to manipulate core tables with raw SQL:

- `issues.findCandidates(filters)`
- `issues.get(key)`
- `timeEntries.createBatch(request)`
- `timeEntries.update(id, changes)`
- `timeEntries.delete(id)`
- `timeEntries.list(filters)`
- `timeEntries.getLockState(ids)`

Automatic Time receives no capability to lock entries.

## Plugin Packaging

Create a bundled plugin at `plugins/plugin-automatic-time/`:

- ID: `@weaver/plugin-automatic-time`
- Type: `app`
- Scope: `tenant`
- Default state: not installed and disabled
- Dependency: core `time-entries` capability
- Navigation: `Drafts`
- Pages:
  - `/apps/automatic-time/drafts`
  - `/apps/automatic-time/review`
  - `/apps/automatic-time/settings`
- Optional slot: issue activity panel showing released automatic entries
- Events emitted:
  - `automatic-time.device_paired`
  - `automatic-time.device_revoked`
  - `automatic-time.draft_corrected`
  - `automatic-time.day_released`
  - `automatic-time.day_reopened`
- Events consumed:
  - issue and project create, update, and delete events
  - time-entry lock events

The plugin is tenant-scoped because one day can cross projects and contain unassigned work. Its settings can exclude specific projects, repositories, applications, domains, and window-title patterns.

## Plugin Platform Deltas

Implement only the shared platform work required to make this plugin trustworthy:

1. Validate manifests at load time rather than trusting parsed JSON.
2. Add manifest `requires` declarations for core capabilities and plugin dependencies.
3. Add companion metadata such as platform, download artifact, minimum version, and pairing route.
4. Make install and upgrade migrations atomic and fail closed.
5. Do not mark a plugin installed when its schema migration or `onInstall` fails.
6. Add per-user plugin settings or plugin-owned user settings tables.
7. Add a device authentication mode for explicitly declared plugin routes.
8. Revoke all device credentials when the plugin is disabled or uninstalled.
9. Require explicit confirmation before uninstalling plugin-owned private data.

Dynamic client loading remains a separate roadmap item. The first version may add one build-time importer and workspace dependency for this first-party plugin.

## Device Pairing and Authentication

The companion must not reuse a browser JWT or ask the user to paste a long-lived API key.

### Pairing flow

1. Companion requests a short-lived pairing code and verification URL.
2. User opens the URL in Weaver and authenticates normally.
3. Weaver shows the exact plugin, device name, requested scopes, and expiration behavior.
4. User approves the device.
5. Companion exchanges the approved code for a revocable device credential.
6. Credential is stored in macOS Keychain.

### Device scopes

- `automatic-time:candidates:read`
- `automatic-time:drafts:read`
- `automatic-time:drafts:write`
- `automatic-time:rules:read`
- `automatic-time:device:heartbeat`

Device credentials cannot release time, change official entries, read unrelated Weaver data, or administer plugins.

### Pairing protections

- Pairing codes expire quickly and are single-use.
- Polling and failed exchanges are rate limited.
- Tokens are stored hashed at rest and shown only once.
- Device credentials are tenant-bound, user-bound, plugin-bound, and revocable.
- Revocation takes effect immediately.
- Last-seen time and companion version are visible in plugin settings.

## Plugin Server Data

Use namespaced plugin-owned tables installed through versioned migrations:

### `automatic_time_devices`

- Device ID, user ID, display name, platform, companion version
- Token hash, scopes, last seen, created, revoked, and expiration timestamps

### `automatic_time_drafts`

- Draft ID and user ID
- Companion-generated immutable source reference
- Start, end, and proposed minutes
- Generated task description
- Assigned issue ID and issue key, nullable while private
- Confidence, assignment method, and explanation reasons
- Status: `draft`, `hidden`, `released`, or `superseded`
- Local evidence digest, never raw evidence
- Created, updated, and released timestamps

### `automatic_time_correction_memories`

- User ID and memory type
- Normalized match features
- Target project or issue
- Weight, positive count, negative count, last applied timestamp
- Enabled flag and human-readable explanation

### `automatic_time_release_batches`

- User ID and local date
- Idempotency key
- Status: `pending`, `released`, `reopened`, or `partially_locked`
- Reported total and official time-entry IDs
- Created, released, and reopened timestamps

### `automatic_time_user_settings`

- Capture exclusions
- Retention settings
- Confidence thresholds
- Interruption smoothing threshold
- Rounding preference
- Companion and inference preferences

Do not store raw application events, window titles, browser titles, full URLs, repository paths, or Git history on the Weaver server.

## Companion Local Data

Use an encrypted local database whose key is stored in macOS Keychain.

Local tables or stores should cover:

- Raw signals
- Derived activity blocks
- Issue candidate snapshot
- Correction-memory cache
- Durable sync outbox
- Retention tombstones and deletion verification

The companion must recover safely from crashes, offline periods, sleep and wake, clock changes, timezone changes, and token revocation. Synthetic fixtures must be used for automated tests so private local activity never enters the repository.

## Capture Boundary

Capture only the metadata required to identify work:

- Active application bundle identifier and display name
- Active window title when permission permits
- Browser domain and page title, without query strings or page contents
- Idle state
- Screen lock, sleep, wake, and application lifecycle
- Git repository fingerprint, branch, and current commit identifier
- IDE workspace or repository association, without file contents
- Current and recently viewed Weaver issues

Explicitly exclude:

- Screenshots
- Audio
- Keystrokes or input contents
- Clipboard contents
- Source-file contents or diffs
- Browser page contents
- Full URLs, query strings, cookies, headers, or form data
- Credential values or secrets

The companion settings must support pause, timed pause, application exclusions, domain exclusions, and repository exclusions.

## Segmentation

The segmenter converts a chronological signal stream into stable activity blocks before assignment.

Rules should be deterministic and fixture-tested:

- Close a block on a durable context change.
- Merge brief interruptions below the smoothing threshold.
- Preserve an exact issue-key transition even when brief.
- Stop time during idle, sleep, lock, and explicit pause.
- Do not infer activity during missing-signal gaps.
- Split blocks at the local-day boundary without losing elapsed time.
- Preserve captured duration separately from user-adjusted report duration.

The segmenter should not call an AI model.

## Assignment Engine

Assignment runs locally using a bounded candidate set.

### Ordered evidence

1. Exact issue key in Git branch, application title, browser title, or Weaver context
2. Explicit repository-to-project or repository-to-issue mapping
3. Confirmed correction memories
4. Active or recently viewed Weaver issue
5. Recent commit and issue activity within the mapped project
6. Semantic similarity among bounded open issue candidates

### Output

Each assignment returns:

- Suggested issue or `unassigned`
- Confidence from 0 through 1
- Assignment method
- Human-readable reasons
- Ranked alternatives
- Model or ruleset version

AI may cluster blocks and write concise descriptions only after deterministic segmentation. It must not expand the candidate set, invent issue keys, create issues, or release entries.

## Correction Learning

Manual changes should improve future scoring without opaque online fine-tuning.

- Reassignment records positive evidence for the chosen issue.
- Rejection records negative evidence for the rejected candidate.
- Repository and branch associations become explicit weighted memories.
- Repeated title-token associations gain weight gradually.
- Stale issue-specific memories decay or become inactive when issues close.
- The settings page lists memories with their explanation, target, strength, and last use.
- Users can disable or delete a memory and recompute affected private drafts.
- Correction memory never changes already released time automatically.

## Drafts Experience

The live Drafts page should answer three questions at a glance:

1. What does Weaver think I worked on?
2. Where does Weaver think the time belongs?
3. Why does Weaver think that?

Required actions:

- Assign or reassign an issue
- Rename the task description
- Adjust start, end, or reported minutes
- Merge adjacent drafts
- Split a draft at a chosen time
- Hide off-task time
- Delete a draft
- Add offline work
- Inspect confidence, reasons, and alternatives
- Open the related Weaver issue
- Pause or resume the companion

The current activity may appear in the timeline but remains clearly marked as incomplete.

## Daily Review and Release

Daily Review presents one card at a time with keyboard-friendly actions.

- Keep the assignment
- Choose an alternative
- Search for another issue
- Rename
- Adjust minutes
- Merge or split
- Hide or delete
- Add offline work

The final step shows captured time, hidden time, reported time, and any manual adjustment. The user may adjust the final reported total, with the difference distributed only after explicit confirmation.

Release requirements:

- Every draft is assigned, hidden, or deleted.
- The user sees the exact official entries that will be created.
- Release uses one idempotency key for the day.
- Core creation is atomic.
- A failed release leaves the day private and retryable.
- A released day may be reopened only while all associated entries are unlocked.
- Reopening never silently changes official entries.

## Implementation Sequence

Tasks are ordered to produce the smallest complete vertical slice before building passive capture.

### Phase 0: Baseline and decisions

- [x] Repair or explicitly isolate the existing root test configuration failures before adding new suites.
- [x] Record an architecture decision for the companion technology after a small metadata-capture and encrypted-storage spike.
- [x] Confirm local-only inference, retention defaults, smoothing threshold, rounding, and unassigned release behavior.
- [x] Define a synthetic labeled-day fixture format and metric calculations.
- [x] Capture the existing manual time-entry API contract as regression tests.

Gate: current manual logging is regression-covered, the relevant test commands are clean, and companion feasibility is demonstrated without capturing private user data.

Phase 0 evidence:

- The root test task now treats empty UI and web unit-test suites as valid while excluding Playwright specifications from Vitest discovery. A forced uncached run completed 11 test tasks successfully.
- `time-tracking.service.spec.ts` adds seven focused manual worklog regression tests.
- `@weaver/automatic-time-evaluation` validates non-overlapping synthetic labeled days and calculates minute-weighted destination accuracy, suggestion precision, evidence-method coverage, unassigned time, and review duration. Its example day has 450 labeled minutes and an exact `0.80` destination accuracy.
- [`docs/architecture/automatic-time-companion.md`](../architecture/automatic-time-companion.md) records the native Swift decision and local-alpha defaults.
- `spikes/automatic-time-macos/` compiles the AppKit, Accessibility, CryptoKit, and Keychain boundaries. Two synthetic Swift tests verify encrypted round-trip, plaintext absence, owner-only file permissions, and retention deletion. Its diagnostic reports booleans only.

### Phase 1: Core worklog and plugin prerequisites

- [x] Add backward-compatible core time-entry fields and tenant migration.
- [x] Add lock enforcement and idempotent batch creation.
- [x] Add typed time-entry and issue-candidate capabilities to the SDK.
- [x] Add capability checks to the server plugin context.
- [x] Add manifest validation, `requires`, and companion metadata.
- [x] Make install and upgrade migration handling atomic and fail closed.
- [x] Add core unit and HTTP boundary tests.

Gate: an authorized test plugin can create one idempotent official entry through the capability API, while an unauthorized or disabled plugin cannot.

Phase 1 evidence:

- `time_entries` now carries interval, source, plugin reference, lock, and update fields. An idempotent tenant migration upgrades existing schemas and adds a partial unique index on plugin ID plus source reference.
- Manual logging remains the default source, the existing timer records `timer`, and plugin batches record `plugin`. Locked entries reject update and delete operations.
- `PluginCoreApi` exposes typed issue candidates and owner-scoped time-entry operations. Runtime checks require both a declared manifest capability and an installed, enabled plugin.
- Plugin manifests are validated before loading. The schema covers core and plugin requirements, companion metadata, and backward-compatible or versioned migrations; all bundled manifests pass validation.
- Install, enable, disable, and versioned upgrade lifecycle work runs inside one database transaction. Failed hooks or migrations do not create an installed record, advance a version, or flip enabled state.
- The database-backed `automatic-time-core.e2e-spec.ts` creates one official entry through an authorized test plugin, returns the same entry with `created: 0` on retry, denies the disabled plugin, and observes HTTP `409` responses for locked update and delete attempts.

### Phase 2: Synthetic end-to-end vertical slice

- [x] Scaffold `@weaver/plugin-automatic-time` with server, client, manifest, and migrations.
- [x] Add plugin-owned draft, correction-memory, release-batch, user-settings, and device tables.
- [x] Add a Drafts navigation entry and page.
- [x] Load synthetic derived drafts through a test-only fixture adapter.
- [x] Implement manual issue assignment, edit, hide, and delete.
- [x] Implement Daily Review and atomic release.
- [x] Verify released entries appear in issue history and existing reports.
- [x] Verify disable and uninstall behavior.

Gate: a synthetic private draft can be reviewed and released into exactly one official core entry with no duplicate after retry.

Phase 2 evidence:

- `@weaver/plugin-automatic-time` is a bundled, tenant-scoped app that installs disabled by default. Its validated manifest declares private-draft permissions, core capabilities, Drafts and Daily Review pages, routes, versioned migrations, and explicit private-data deletion behavior.
- Version `0.1.0` creates namespaced draft, correction-memory, release-batch, user-settings, and device tables. Draft reads and mutations require the interactive user ID, and the database-backed test proves another user can neither see nor edit the draft.
- Synthetic fixture import is fail-closed unless the dedicated test-process switch is enabled. It accepts derived draft metadata and evidence digests only, not raw application, window, browser, repository, or Git data.
- The Drafts page supports issue assignment, minutes and description edits, hiding, deletion, date navigation, and private-state messaging. Daily Review blocks unresolved work and requires an explicit release action.
- Release records a pending per-user, per-day idempotency batch, asks core to create the official entries atomically, and records the private-to-official mapping in one plugin mutation. Retry returns the same official entry with `created: 0`.
- `automatic-time-plugin.e2e-spec.ts` covers install-disabled, explicit enable, fixture import, cross-user privacy, edit, assign, hide, delete, review, release, retry, issue activity visibility, Time Reports visibility, disable, confirmed uninstall, private-table deletion, and official-entry preservation.
- Private-data uninstall requires explicit confirmation and runs lifecycle cleanup plus registry removal in one database transaction. A focused regression test proves a failed private-data deletion leaves the plugin installed.
- The Phase 2 acceptance flow exposed and fixed the existing Time Reports issue grouping query, which now reads the canonical `issues.summary` column.
- Browser acceptance at 1920 by 1080 verifies install-disabled, explicit enable, Drafts navigation, edit, manual assignment, resolved Daily Review, explicit release, and the resulting `0h 50m` entry in the issue Logs tab. The console is clean, and the web Tailwind source explicitly includes the bundled plugin so its responsive layout is present in production CSS.

### Phase 3: Companion foundation and pairing

- [ ] Create the macOS companion project and reproducible build configuration.
- [ ] Implement Keychain-backed device credentials.
- [ ] Implement short-lived pairing and user approval.
- [ ] Implement encrypted local storage and durable outbox.
- [ ] Implement device status, revocation, and version display in plugin settings.
- [ ] Add offline, expiration, revocation, and retry tests.

Gate: a paired companion can sync a synthetic derived draft but cannot release official time or access unrelated Weaver data.

### Phase 4: Metadata capture and segmentation

- [ ] Implement active application and window metadata capture.
- [ ] Implement browser domain and title capture with explicit permission boundaries.
- [ ] Implement idle, pause, lock, sleep, and wake handling.
- [ ] Implement Git repository, branch, and commit metadata capture without contents.
- [ ] Implement Weaver candidate and recent-context synchronization.
- [ ] Implement deterministic segmentation and interruption smoothing.
- [ ] Implement retention deletion and verification.
- [ ] Add fixture-driven unit and recovery tests.

Gate: a synthetic workday produces stable activity blocks with no idle inflation, no raw-signal upload, and no loss across restart.

### Phase 5: Assignment, confidence, and descriptions

- [ ] Implement bounded issue-candidate snapshots.
- [ ] Implement exact issue-key matching.
- [ ] Implement repository and branch mappings.
- [ ] Implement recency and Weaver-context scoring.
- [ ] Implement correction-memory scoring.
- [ ] Add local semantic ranking only after deterministic evidence.
- [ ] Add local activity clustering and concise descriptions.
- [ ] Store confidence, reasons, alternatives, and ruleset version on every draft.
- [ ] Add deterministic and labeled-fixture evaluation suites.

Gate: the assignment harness reaches the agreed accuracy threshold without inventing issues or sending raw metadata remotely.

### Phase 6: Complete live and daily review UX

- [ ] Connect live companion drafts to the Drafts timeline.
- [ ] Add confidence and "Why this issue?" details.
- [ ] Add merge, split, offline work, and current-activity states.
- [ ] Add keyboard-first Daily Review.
- [ ] Add final reported-total adjustment with explicit preview.
- [ ] Add reopen behavior for unlocked days and clear handling for partially locked days.
- [ ] Add loading, offline, stale-device, failure, and empty states.
- [ ] Add component, integration, and browser tests.

Gate: a representative day can be reviewed and released in under two minutes without using a timer.

### Phase 7: Learning, privacy, and local alpha

- [ ] Update correction memories from confirmed reassignment and rejection.
- [ ] Add memory inspection, disable, deletion, and recomputation.
- [ ] Add local-only quality and review-time metrics.
- [ ] Run privacy threat modeling for companion, pairing, sync, and uninstall.
- [ ] Verify raw retention with time-controlled tests.
- [ ] Verify no screenshots, content, credentials, or raw signals cross the network.
- [ ] Run a ten-working-day single-user alpha.
- [ ] Compare assignment accuracy, review time, unmatched rate, correction rate, and manual-timer use against acceptance criteria.

Gate: the full acceptance criteria pass on a representative local trial and unresolved privacy or reliability findings are documented.

## Expected Code Surface

This is the anticipated ownership map. Phase 0 may refine names, but it should preserve these boundaries.

### Weaver core

- `packages/db/src/entities/tenant/time-entry.entity.ts`
- Tenant schema provisioning or migration files under `packages/db`
- `packages/shared/src/schemas/index.ts`
- `packages/shared/src/types/index.ts`
- `apps/api/src/modules/time-tracking/time-tracking.controller.ts`
- `apps/api/src/modules/time-tracking/time-tracking.service.ts`
- `apps/api/src/modules/time-tracking/time-tracking.module.ts`
- Core time-tracking unit and HTTP tests

### Plugin SDK and runtime

- `packages/sdk/src/interfaces/plugin-manifest.interface.ts`
- `packages/sdk/src/interfaces/plugin-context.interface.ts`
- `packages/sdk/src/interfaces/plugin.interface.ts`
- `apps/api/src/plugins/plugin-loader.service.ts`
- `apps/api/src/plugins/plugin-registry.service.ts`
- `apps/api/src/plugins/plugin-context.factory.ts`
- `apps/api/src/plugins/plugin-route.controller.ts`
- Plugin lifecycle, capability, and device-auth tests

### Automatic Time plugin

- `plugins/plugin-automatic-time/weaver-plugin.json`
- `plugins/plugin-automatic-time/src/server/`
- `plugins/plugin-automatic-time/src/client/`
- `plugins/plugin-automatic-time/migrations/`
- `plugins/plugin-automatic-time/test/`
- `apps/web/src/plugins/dynamic-loader.ts` for the initial bundled importer
- `apps/web/package.json` and workspace configuration

### macOS companion

- `companion/automatic-time-macos/`
- Capture adapters separated from segmentation and assignment logic
- Local database, Keychain, sync, inference, and menu-bar modules
- Synthetic fixtures and tests stored without real activity data

### Evaluation harness

- `packages/automatic-time-evaluation/`
- Versioned synthetic labeled-day fixtures
- Minute-weighted assignment and review metrics

Avoid placing private-draft entities in the core database package or capture code in the Weaver web application. Those would collapse the privacy and optional-plugin boundaries.

## Test Strategy

### Core

- Entity and migration tests for backward compatibility
- Service tests for lock enforcement and source validation
- Transaction tests for batch idempotency and rollback
- Permission tests for plugin capabilities
- Tenant-isolation tests using two tenants with overlapping source references

### Plugin server

- Install, migration, upgrade, disable, enable, and uninstall tests
- Device scope and revocation tests
- User-visibility tests proving drafts cannot cross users
- Release and reopen state-machine tests
- Correction-memory ownership and deletion tests

### Plugin web

- Component tests for all draft actions
- Keyboard navigation and accessibility tests for Daily Review
- Browser tests for install, pair, review, release, reopen, disable, and uninstall
- Failure-state tests for offline companion and failed release

### Companion

- Fixture tests for capture normalization and segmentation
- Retention tests with an injected clock
- Crash and restart tests for the outbox
- Token expiration and revocation tests
- Network-contract tests proving raw signals never leave the device
- Tests must use synthetic application, title, repository, and issue data

### Evaluation harness

- Representative labeled days with expected blocks and issue assignments
- Top-one issue accuracy
- Suggestion coverage
- Unassigned rate
- Correction rate
- Review duration
- Duplicate-entry count
- Captured versus reported time reconciliation

## Acceptance Criteria

### Product

- At least 80 percent top-one issue accuracy on a representative labeled day set.
- Median Daily Review time is under two minutes for a normal workday.
- Manual timers are exceptional during the local alpha.
- Unmatched work remains intelligible and recoverable as a private draft.
- Every automatic suggestion is editable and explains its evidence.

### Privacy and security

- Raw signals never leave the companion.
- No screenshots, audio, keystrokes, clipboard data, file contents, or page contents are captured.
- Device credentials cannot release official time.
- Private drafts are accessible only to their owner.
- Raw-signal retention satisfies the configured limit and has automated deletion evidence.
- Device revocation and plugin disable stop sync immediately.

### Integrity

- Release is explicit, previewed, atomic, and idempotent.
- Retry creates no duplicate entries.
- Locked official entries cannot be edited, reopened, or deleted.
- Disabling or uninstalling the plugin preserves official time entries.
- Manual logging and the existing timer work without the plugin.
- Existing reports include released automatic entries without a second reporting model.

### Reliability

- Capture handles pause, idle, lock, sleep, wake, restart, offline periods, timezone changes, and day boundaries.
- A companion or server crash loses no acknowledged draft and creates no duplicate.
- Plugin install or upgrade failure leaves the prior working state intact.
- Plugin load failure degrades gracefully and does not crash Weaver.

## Local Alpha Review

Run the first alpha for ten working days. Review results after days two, five, and ten without changing scoring rules mid-day.

Record locally:

- Total captured minutes
- Total reported minutes
- Number of drafts
- Correct top-one assignments
- Suggested assignments accepted
- Reassignments
- Unassigned drafts
- Review duration
- Manual timer entries
- Hidden or deleted time
- Capture gaps and companion failures

Continue only if the system is saving attention rather than moving timer work into correction work.

## Delivery and Release Boundaries

- Planning and local implementation do not authorize a commit, push, signed companion build, distribution, deployment, or release.
- Treat the companion binary, plugin package, database migrations, and live deployment as separate approval targets.
- Before any real-data migration, show the exact migration, affected tenant schemas, backup, and rollback.
- Before signing or distributing the companion, verify permissions, entitlements, update behavior, and the exact artifact checksum.
- Before enabling the plugin outside the local test tenant, complete privacy and data-retention verification.

## Open Decisions

Resolve each item before its smallest relevant implementation phase:

- Local inference runtime and model
- Browser metadata mechanism and permission UX
- Exact issue-candidate lookback window
- How final-total adjustments are distributed across drafts
- How companion updates are signed and delivered
