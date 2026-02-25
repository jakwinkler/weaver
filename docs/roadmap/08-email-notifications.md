# Email Notifications

> Send email for issue assignments, mentions, status changes, and comment replies.

## Why

In-app notifications only work when users have the app open. Email is the fallback channel that every PM tool supports. The queue infrastructure already exists via BullMQ -- we just need to wire the triggers, build the templates, and respect user preferences.

## Current State

- BullMQ `notifications` queue exists with `processNotification()` handler in the worker
- NotificationJobData has `type: 'in_app' | 'email'`
- Worker has email sending skeleton (SMTP/SES) but no actual implementation
- Tenant settings have SMTP config schema (`smtpSettingsSchema`)
- `POST /settings/smtp/test` endpoint exists for testing SMTP connectivity
- No triggers actually enqueue email notifications yet
- No email templates exist
- No user notification preferences

## Tasks

### Backend
- [ ] **Create email templates** — Handlebars/MJML templates for: issue assigned, mentioned in comment, issue status changed, comment added. Each has subject line, body with issue link, unsubscribe link. Responsive design for mobile email clients. _Files: `apps/api/src/modules/mail/templates/`_
- [ ] **Email rendering service** — Compile templates with data (issueKey, projectName, userName, actionText, issueUrl). Support both HTML and plain text output. _Files: `apps/api/src/modules/mail/mail.service.ts`_
- [ ] **Wire assignment notification** — When `assigneeId` changes on issue update, enqueue email to new assignee. Include issue title, project, and who assigned them. _Files: `apps/api/src/modules/issues/issues.service.ts`_
- [ ] **Wire comment notification** — When comment created, enqueue email to issue reporter + assignee (except comment author). Include comment excerpt and link to issue. _Files: `apps/api/src/modules/comments/comments.service.ts`_
- [ ] **Wire mention notification** — When mention detected in comment, enqueue email to mentioned user. Include comment excerpt with mention context. _Files: `apps/api/src/modules/comments/comments.service.ts`_
- [ ] **Wire status change notification** — When issue transitions, enqueue email to assignee + reporter. Include old status, new status, and who triggered the change. _Files: `apps/api/src/modules/issues/issues.service.ts`_
- [ ] **User notification preferences** — Add `notificationPreferences` JSONB column to UserEntity. Fields: `emailOnAssign`, `emailOnMention`, `emailOnComment`, `emailOnStatusChange`. Default all true. Add `PATCH /users/me/notification-preferences` endpoint. _Files: `packages/db/src/entities/public/user.entity.ts`_
- [ ] **Respect preferences before enqueuing** — Check user's preferences before adding email job to queue. Skip silently if preference is off. _Files: `apps/api/src/modules/mail/mail.service.ts`_
- [ ] **Unsubscribe endpoint** — `POST /notifications/unsubscribe` with signed token to toggle specific preference without login. Token encodes userId + preference key. _Files: `apps/api/src/modules/notifications/notifications.controller.ts`_

### Worker
- [ ] **Implement SMTP sending** — Use nodemailer with tenant SMTP settings. Fallback to system SMTP if tenant has none. Handle connection errors gracefully with retry (3 attempts, exponential backoff). _Files: `apps/worker/src/processors/notification.processor.ts`_
- [ ] **Rate limiting** — Max 10 emails/second per tenant to avoid spam classification. Use BullMQ rate limiter or token bucket in processor. _Files: `apps/worker/src/processors/notification.processor.ts`_

### Frontend
- [ ] **Notification preferences page** — Toggle switches for each email type in Profile page. Save via PATCH endpoint. Show current state on load. _Files: `apps/web/src/features/profile/ProfilePage.tsx`_
- [ ] **SMTP setup in system settings** — Form for host, port, user, password, from address, TLS toggle. Test button that calls `POST /settings/smtp/test` and shows success/error. _Files: `apps/web/src/features/settings/SystemSettingsPage.tsx`_

### Tests
- [ ] **E2E: assignment triggers email job** — Assign issue, verify notification job enqueued with type 'email' and correct recipient. _File: `apps/api/test/email-notifications.e2e-spec.ts`_
- [ ] **E2E: preferences respected** — Disable emailOnAssign, assign issue, verify no email job enqueued. _File: `apps/api/test/email-notifications.e2e-spec.ts`_
- [ ] **E2E: SMTP test endpoint** — POST /settings/smtp/test sends test email (mock SMTP server). _File: `apps/api/test/email-notifications.e2e-spec.ts`_

## Acceptance Criteria

- Email sent when assigned to issue
- Email sent when mentioned in comment
- Email sent when issue you reported/are assigned to changes status
- Email sent when someone comments on your issue
- User can toggle each notification type in profile settings
- Admin can configure SMTP in system settings
- Test email button works and reports success/failure
- Emails contain direct link to issue
- Emails include one-click unsubscribe link (RFC 8058)
- Rate limited to 10/second per tenant to prevent spam
- Graceful fallback when SMTP is not configured (log warning, skip silently)

## Dependencies

- 07-mentions (for mention-triggered emails)
