# @Mentions

> Type @ in comments to mention users. Mentioned users get notified.

## Why

@mentions are the primary way teams direct attention in PM tools. Without them, people have to manually assign or notify collaborators out-of-band. Mentions create a natural, inline workflow for pulling people into conversations on specific issues.

## Current State

- Comments use TipTap (rich text JSON stored as JSONB)
- Comment creation and updates extract nested mentions and notify newly mentioned tenant members
- `GET /users/search` provides a tenant-scoped, prefix-searchable typeahead source
- RichTextEditor opens an accessible, debounced user picker when `@` is typed
- Read-only rich text renders avatar-aware mention chips
- In-app notification payloads link mentions back to the issue; email delivery remains in 08-email-notifications

## Tasks

### Backend

- [x] **Mention extraction service** — Parse TipTap JSON for mention nodes (`{ type: 'mention', attrs: { id: userId } }`). Return list of mentioned userIds. Handle nested content (mentions inside paragraphs, lists, etc.). _Files: `apps/api/src/modules/comments/mention.service.ts`_
- [x] **Create notifications on mention** — When a comment is created/updated, extract mentions, create notification for each mentioned user: `{ type: 'mention', title: '@You in PROJ-123', data: { issueKey, commentId } }`. Diff old vs new mentions on update to avoid duplicate notifications. _Files: `apps/api/src/modules/comments/comments.service.ts`_
- [x] **Avoid self-mention notification** — Don't notify the comment author if they mention themselves. _Files: `apps/api/src/modules/comments/comments.service.ts`_
- [x] **GET /users/search endpoint** — Search users by displayName prefix for typeahead. Return `[{ id, displayName, email, avatarUrl }]`. Limit to 10 results. Scoped to tenant. _Files: `apps/api/src/modules/users/users.controller.ts`, `apps/api/src/modules/users/users.service.ts`_

### Frontend

- [x] **Add TipTap Mention extension** — Install `@tiptap/extension-mention`. Configure suggestion popup with user search. Wire into existing RichTextEditor component. _Files: `apps/web/src/components/RichTextEditor.tsx`_
- [x] **Mention suggestion popup** — On typing `@`, show dropdown of users. Filter as user types. Click or Enter to insert mention. Show avatar + display name in dropdown. Position popup relative to cursor. _Files: `apps/web/src/components/MentionSuggestion.tsx`_
- [x] **Render mentions** — In RichTextRenderer, style mention nodes as clickable chips with user avatar and name. Link to user profile if available. _Files: `apps/web/src/components/RichTextRenderer.tsx`_
- [x] **User search hook** — `useSearchUsers(query)` hook that calls the search endpoint with debounce (300ms). Returns `{ data, isLoading }`. _Files: `apps/web/src/api/hooks.ts`_

Weaver does not yet have per-user profile routes, so rendered chips remain non-interactive instead of presenting a dead link target.

### Tests

- [x] **E2E: mention creates notification** — POST comment with mention node, verify notification created for mentioned user. _File: `apps/api/test/mentions.e2e-spec.ts`_
- [x] **E2E: self-mention skipped** — Author mentions self, no notification created. _File: `apps/api/test/mentions.e2e-spec.ts`_
- [x] **E2E: user search** — `GET /users/search?q=ali` returns matching users, respects tenant scope. _File: `apps/api/test/mentions.e2e-spec.ts`_

## Acceptance Criteria

- [x] Typing `@` in comment editor shows user dropdown
- [x] Selecting user inserts styled mention chip into the editor
- [x] Mentioned users receive in-app notification with link to issue
- [x] Mentions render as styled chips in read-only comment view
- [x] Self-mentions don't create notifications
- [x] Updating a comment doesn't re-notify already-mentioned users
- [x] User search is scoped to the current tenant

## Dependencies

- 02-rich-text (TipTap rendering must work first)
- 08-email-notifications (for email mention alerts)
