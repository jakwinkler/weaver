# Scheduled Automations

**Status: Implemented; scheduled runtime verification pending.** Named and custom UTC schedules are registered and handed to the automation engine.

Reconciled September 23, 2026 against main [`27b14d7`](https://github.com/jakwinkler/weaver/commit/27b14d72ab8d201c4bf4fcbffd00830091dd21ce). This is the source baseline, which can differ from the checked-out application branch. Checked implementation items below mean the code exists; they do not certify a release or a fresh test pass.

User guide: [Automations](https://github.com/jakwinkler/weaver/wiki/Automations).

## Implemented

- [x] Startup registration and CRUD reconciliation of enabled BullMQ schedulers across tenants.
- [x] Named daily/weekly/hourly/15-minute schedules and validated five-field custom cron.
- [x] Worker handoff to the API automation consumer; conditions evaluated against matching issues.
- [x] UTC schedule preview and admin Run now for enabled scheduled rules.

## Differences from the original plan

- The scheduler and worker path exist.
- Run now is a normal execution endpoint, not a test-only dry run.
- All schedule calculations use UTC, not each user's local timezone.

## Remaining work and verification

- [ ] Verify an actual scheduled firing, restart reconciliation, disabled/deleted schedules, and worker interruption recovery.
- [ ] Bound the matching-issue set and external-action fan-out before broad scheduled rules.

## Evidence

Schedule schemas, registration, and handoff were source-reviewed. Existing tests exercise scheduler registration and manual execution; no overnight firing was observed for the documentation work.

### Implementation

- [apps/api/src/modules/automations/automation-scheduler.service.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/src/modules/automations/automation-scheduler.service.ts)
- [apps/api/src/modules/automations/automation-engine.service.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/src/modules/automations/automation-engine.service.ts)
- [apps/worker/src/processors/automation.processor.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/worker/src/processors/automation.processor.ts)
- [apps/web/src/features/admin/CronPreview.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/features/admin/CronPreview.tsx)

### Existing automated coverage, not rerun for this documentation edit

- [apps/api/test/scheduled-automations.e2e-spec.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/test/scheduled-automations.e2e-spec.ts)
- [apps/api/src/modules/automations/automation-scheduler.service.spec.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/src/modules/automations/automation-scheduler.service.spec.ts)

## Dependencies

- 15-automation-engine (core engine)
- 16-automation-rules-ui (trigger selector)
