# Audit Log

**Status: Implemented with coverage gaps.** Tenant audit storage, queries, export, retention, and the administration screen exist.

Reconciled September 23, 2026 against main [`27b14d7`](https://github.com/jakwinkler/weaver/commit/27b14d72ab8d201c4bf4fcbffd00830091dd21ce). This is the source baseline, which can differ from the checked-out application branch. Checked implementation items below mean the code exists; they do not certify a release or a fresh test pass.

User guide: [Audit Log](https://github.com/jakwinkler/weaver/wiki/Audit-Log).

## Implemented

- [x] Tenant audit entity/service, request actor/IP/user-agent capture, and sanitization.
- [x] Decorator/interceptor instrumentation with optional before/after state for selected operations.
- [x] Project/member, role/user, workflow, plugin, webhook, and settings controller coverage.
- [x] Admin filtering/detail view, CSV export, and configurable retention queue (90-day default; 50,000-row default export limit).

## Differences from the original plan

- The tenant audit trail exists; it is separate from per-issue activity.
- Instrumentation is opt-in. Automation management was named in the original plan but its controller has no audit decorator/service integration in this baseline.
- No general claim of immutable, complete, or compliance-certified audit storage is supported. Logging failures are recorded by the interceptor without necessarily rejecting the original write.

## Remaining work and verification

- [ ] Instrument automation CRUD/toggles and verify recorded actor, target, and sanitized changes.
- [ ] Decide and test retained deletion evidence for issue/bulk operations instead of relying on activity rows removed with the issue.
- [ ] Exercise CSV export, retention cleanup, failure monitoring, and expected event coverage in an operational environment.

## Evidence

The local audit page rendered project creation and plugin installation entries. Export and retention were source-reviewed, not run during the documentation walkthrough.

### Implementation

- [apps/api/src/modules/audit/audit.service.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/src/modules/audit/audit.service.ts)
- [apps/api/src/modules/audit/audit.interceptor.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/src/modules/audit/audit.interceptor.ts)
- [apps/api/src/modules/automations/automations.controller.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/src/modules/automations/automations.controller.ts)
- [apps/web/src/features/admin/AuditLogPage.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/features/admin/AuditLogPage.tsx)

### Existing automated coverage, not rerun for this documentation edit

- [apps/api/test/audit-log.e2e-spec.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/test/audit-log.e2e-spec.ts)

## Dependencies

- None
