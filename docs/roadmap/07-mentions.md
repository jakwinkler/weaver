# @Mentions

> Type @ in comments to mention users. Mentioned users get notified.

## Why

@mentions are the primary way teams direct attention in PM tools. Without them, people have to manually assign or notify collaborators out-of-band. Mentions create a natural, inline workflow for pulling people into conversations on specific issues.

## Current State

- Comments use TipTap (rich text JSON stored as JSONB)
- Notification system exists (in-app + email queue via BullMQ)
- Users list available via `GET /users`
- No mention detection or TipTap mention extension configured
- RichTextEditor component exists at `apps/web/src/components/RichTextEditor.tsx`

## Tasks

### Backend
- [ ] **Mention extraction service** — Parse TipTap JSON for mention nodes (`{ type: 'mention', attrs: { id: userId } }`). Return list of mentioned userIds. Handle nested content (mentions inside paragraphs, lists, etc.). _Files: `apps/api/src/modules/comments/mention.service.ts`_
- [ ] **Create notifications on mention** — When a comment is created/updated, extract mentions, create notification for each mentioned user: `{ type: 'mention', title: '@You in PROJ-123', data: { issueKey, commentId } }`. Diff old vs new mentions on update to avoid duplicate notifications. _Files: `apps/api/src/modules/comments/comments.service.ts`_
- [ ] **Avoid self-mention notification** — Don't notify the comment author if they mention themselves. _Files: `apps/api/src/modules/comments/comments.service.ts`_
- [ ] **GET /users/search endpoint** — Search users by displayName prefix for typeahead. Return `[{ id, displayName, email, avatarUrl }]`. Limit to 10 results. Scoped to tenant. _Files: `apps/api/src/modules/users/users.controller.ts`, `apps/api/src/modules/users/users.service.ts`_

### Frontend
- [ ] **Add TipTap Mention extension** — Install `@tiptap/extension-mention`. Configure suggestion popup with user search. Wire into existing RichTextEditor component. _Files: `apps/web/src/components/RichTextEditor.tsx`_
- [ ] **Mention suggestion popup** — On typing `@`, show dropdown of users. Filter as user types. Click or Enter to insert mention. Show avatar + display name in dropdown. Position popup relative to cursor. _Files: `apps/web/src/components/MentionSuggestion.tsx`_
- [ ] **Render mentions** — In RichTextRenderer, style mention nodes as clickable chips with user avatar and name. Link to user profile if available. _Files: `apps/web/src/components/RichTextRenderer.tsx`_
- [ ] **User search hook** — `useSearchUsers(query)` hook that calls the search endpoint with debounce (300ms). Returns `{ data, isLoading }`. _Files: `apps/web/src/api/hooks.ts`_

### Tests
- [ ] **E2E: mention creates notification** — POST comment with mention node, verify notification created for mentioned user. _File: `apps/api/test/mentions.e2e-spec.ts`_
- [ ] **E2E: self-mention skipped** — Author mentions self, no notification created. _File: `apps/api/test/mentions.e2e-spec.ts`_
- [ ] **E2E: user search** — `GET /users/search?q=ali` returns matching users, respects tenant scope. _File: `apps/api/test/mentions.e2e-spec.ts`_

## Acceptance Criteria

- Typing `@` in comment editor shows user dropdown
- Selecting user inserts styled mention chip into the editor
- Mentioned users receive in-app notification with link to issue
- Mentions render as styled chips in read-only comment view
- Self-mentions don't create notifications
- Updating a comment doesn't re-notify already-mentioned users
- User search is scoped to the current tenant

## Dependencies

- 02-rich-text (TipTap rendering must work first)
- 08-email-notifications (for email mention alerts)
