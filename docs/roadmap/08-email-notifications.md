# Email Notifications

**Status: Implemented; external delivery unverified.** Notification triggers, preferences, templates, and SMTP delivery code are present.

Reconciled September 23, 2026 against main [`27b14d7`](https://github.com/jakwinkler/weaver/commit/27b14d72ab8d201c4bf4fcbffd00830091dd21ce). This is the source baseline, which can differ from the checked-out application branch. Checked implementation items below mean the code exists; they do not certify a release or a fresh test pass.

User guide: [Collaboration and Notifications](https://github.com/jakwinkler/weaver/wiki/Collaboration-and-Notifications).

## Implemented

- [x] Assignment, mention, comment, and status-change email job creation with preference checks.
- [x] Worker email processing, rendered templates, tenant SMTP configuration, and fallback configuration.
- [x] Profile preference controls, signed unsubscribe flow with one-click headers, SMTP settings, and a test-mail action.
- [x] Tenant email throttling in the worker (10 messages/second per worker process).

## Differences from the original plan

- The old claims that only a worker skeleton exists and no templates/triggers/preferences exist are obsolete.
- In-app notification success is separate from queue completion and actual SMTP delivery.
- Unsubscribing changes the relevant category; it is not a universal communication opt-out.
- The email throttle uses process-local state. Multiple workers do not share one global per-tenant 10/second budget.

## Remaining work and verification

- [ ] Run a configured provider delivery check for each notification category and unsubscribe behavior.
- [ ] Exercise delivery failures, retries, tenant configuration precedence, and recipient permissions.

## Evidence

Source and existing tests were inspected. No external email was sent during the documentation work.

### Implementation

- [apps/api/src/modules/notifications/notifications.service.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/src/modules/notifications/notifications.service.ts)
- [apps/worker/src/processors/notifications.processor.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/worker/src/processors/notifications.processor.ts)
- [apps/web/src/features/profile/ProfilePage.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/features/profile/ProfilePage.tsx)
- [apps/web/src/features/settings/SystemSettingsPage.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/features/settings/SystemSettingsPage.tsx)

### Existing automated coverage, not rerun for this documentation edit

- [apps/api/test/email-notifications.e2e-spec.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/test/email-notifications.e2e-spec.ts)
- [apps/api/src/modules/notifications/notifications.service.spec.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/src/modules/notifications/notifications.service.spec.ts)
- [apps/web/src/features/notifications/EmailUnsubscribePage.test.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/features/notifications/EmailUnsubscribePage.test.tsx)

## Dependencies

- 07-mentions (for mention-triggered emails)
