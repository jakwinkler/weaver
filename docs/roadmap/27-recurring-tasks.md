# Recurring Tasks

**Status: Implemented; scheduled generation verification pending.** Recurring issues have validated rules, scheduled cloning, chain history, and controls.

Reconciled September 23, 2026 against main [`27b14d7`](https://github.com/jakwinkler/weaver/commit/27b14d72ab8d201c4bf4fcbffd00830091dd21ce). This is the source baseline, which can differ from the checked-out application branch. Checked implementation items below mean the code exists; they do not certify a release or a fresh test pass.

User guide: [Recurring Tasks](https://github.com/jakwinkler/weaver/wiki/Recurring-Tasks).

## Implemented

- [x] Recurrence rule/parent/occurrence fields and create/update validation.
- [x] Daily scheduler, due-date calculation, shifted instance dates, initial-status reset, and duplicate prevention.
- [x] End-date/max-occurrence stopping and null-rule cancellation.
- [x] Create/detail recurrence picker, list/board indicators, and generated-instance history.

## Differences from the original plan

- The recurrence concept and scheduler are implemented.
- History lists the original and generated instances; it does not materialize every future planned occurrence in advance.
- maxOccurrences counts generated children. Date calculations use UTC; the scheduler's deployment timezone still needs explicit operational verification.

## Remaining work and verification

- [ ] Observe real scheduled generation, restart/retry, month-end and weekday behavior, and stop conditions across timezones.
- [ ] Verify copied fields and initial workflow status when projects or templates change.

## Evidence

A local weekly recurrence rule was saved. Scheduler logic and existing tests were reviewed; no overnight instance generation was observed.

### Implementation

- [apps/api/src/modules/issues/recurrence.service.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/src/modules/issues/recurrence.service.ts)
- [apps/api/src/modules/issues/issues.service.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/src/modules/issues/issues.service.ts)
- [apps/web/src/components/RecurrencePicker.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/components/RecurrencePicker.tsx)
- [apps/web/src/features/issues/IssueDetailPage.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/features/issues/IssueDetailPage.tsx)

### Existing automated coverage, not rerun for this documentation edit

- [apps/api/test/recurring-tasks.e2e-spec.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/test/recurring-tasks.e2e-spec.ts)
- [apps/api/src/modules/issues/recurrence.service.spec.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/src/modules/issues/recurrence.service.spec.ts)

## Dependencies

- None
