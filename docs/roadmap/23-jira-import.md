# Jira Import

**Status: Implemented; real migration unverified.** The Jira wizard, shared importer, background job, and progress/cancellation paths exist.

Reconciled September 23, 2026 against main [`27b14d7`](https://github.com/jakwinkler/weaver/commit/27b14d72ab8d201c4bf4fcbffd00830091dd21ce). This is the source baseline, which can differ from the checked-out application branch. Checked implementation items below mean the code exists; they do not certify a release or a fresh test pass.

User guide: [Jira Import](https://github.com/jakwinkler/weaver/wiki/Jira-Import).

## Implemented

- [x] Cloud REST v3 and Server/Data Center REST v2 clients with supported source credentials and project discovery.
- [x] Queued import orchestration, field/ADF mapping, project/status/type handling, comments, attachments, and sprint import paths.
- [x] Import job progress/errors, source-ID tracking, and key preservation/conflict handling.
- [x] Source/credentials/connection/projects/review wizard, progress polling, and cancellation request.

## Differences from the original plan

- The import/export page is populated, and import endpoints/services are implemented.
- Shared client/mapping implementation lives in packages/jira-import, rather than all the originally proposed API-local filenames.
- Re-import tracking is not two-way synchronization. Cancellation stops further work; it does not roll back already imported data.

## Remaining work and verification

- [ ] Run representative Cloud and Server/Data Center migrations and compare counts, mappings, permissions, attachments, and sprint membership.
- [ ] Verify restart/retry, key conflicts, cancellation, credential handling, and destination rollback before real-data migration.

## Evidence

The local wizard source step rendered and was captured for the guide. Source and mock-based test coverage were inspected; no real Jira connection or migration was performed.

### Implementation

- [apps/api/src/modules/import/import.controller.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/src/modules/import/import.controller.ts)
- [apps/api/src/modules/import/import-orchestrator.service.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/src/modules/import/import-orchestrator.service.ts)
- [packages/jira-import/src](https://github.com/jakwinkler/weaver/tree/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/packages/jira-import/src)
- [apps/worker/src/processors/import.processor.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/worker/src/processors/import.processor.ts)
- [apps/web/src/features/settings/ImportWizard.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/features/settings/ImportWizard.tsx)

### Existing automated coverage, not rerun for this documentation edit

- [apps/api/test/jira-import.e2e-spec.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/test/jira-import.e2e-spec.ts)

## Dependencies

- None
