# @Mentions

**Status: Implemented.** Comments support tenant-scoped mention suggestions and notifications for newly mentioned users.

Reconciled September 23, 2026 against main [`27b14d7`](https://github.com/jakwinkler/weaver/commit/27b14d72ab8d201c4bf4fcbffd00830091dd21ce). This is the source baseline, which can differ from the checked-out application branch. Checked implementation items below mean the code exists; they do not certify a release or a fresh test pass.

User guide: [Collaboration and Notifications](https://github.com/jakwinkler/weaver/wiki/Collaboration-and-Notifications).

## Implemented

- [x] Nested TipTap mention extraction, deduplication, and self-notification suppression.
- [x] Tenant-scoped user prefix search and a debounced editor picker.
- [x] Mention chips, issue links, and notification handling for create/edit differences.

## Differences from the original plan

- Mention extraction, suggestions, and in-app notifications are implemented.
- Email delivery is a separate configured worker path, covered by feature 08.
- Plain text containing a name is not an actual mention node.

## Remaining work and verification

- [ ] Verify receipt with separate users, edits that add/remove mentions, and restricted project access.
- [ ] Verify email delivery independently when SMTP is enabled.

## Evidence

Source and automated coverage were reviewed; multiple-user notification receipt was not exercised in the documentation walkthrough.

### Implementation

- [apps/api/src/modules/comments/mention.service.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/src/modules/comments/mention.service.ts)
- [apps/api/src/modules/comments/comments.service.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/src/modules/comments/comments.service.ts)
- [apps/web/src/components/RichTextEditor.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/components/RichTextEditor.tsx)

### Existing automated coverage, not rerun for this documentation edit

- [apps/api/test/mentions.e2e-spec.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/test/mentions.e2e-spec.ts)
- [apps/api/src/modules/comments/mention.service.spec.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/src/modules/comments/mention.service.spec.ts)

## Dependencies

- 02-rich-text (TipTap rendering must work first)
- 08-email-notifications (for email mention alerts)
