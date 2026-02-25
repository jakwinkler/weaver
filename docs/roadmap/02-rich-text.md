# Rich Text Rendering

> Render and edit TipTap JSON in issue descriptions, comments, and anywhere rich content appears.

## Why

Currently descriptions and comments are stored as TipTap JSON objects but rendered as raw JSON or plain text. This makes the app feel broken — every PM tool has proper rich text.

## Current State

- `RichTextEditor.tsx` exists with TipTap, can serialize to JSON
- Comments use `body: z.record(z.unknown())` (JSON object)
- Issue descriptions stored as JSONB
- No rendering component for TipTap JSON (only editor)
- ProjectsPage description field uses RichTextEditor for creation

## Tasks

### Frontend

- [x] **Create RichTextRenderer component** — `RichTextEditor` with `editable={false}` serves as the renderer. Supports headings, bold, italic, code, links, lists, blockquotes, images, code blocks via StarterKit + extensions. _Files: `apps/web/src/components/RichTextEditor.tsx`_
- [x] **Render issue descriptions** — Replaced raw `JSON.stringify` in IssueDetailPage with `RichTextEditor editable={false}`. Click-to-edit (pencil icon on hover) switches to full RichTextEditor with Save/Cancel buttons. _Files: `apps/web/src/features/issues/IssueDetailPage.tsx`_
- [x] **Render comments** — CommentsSection already uses `RichTextEditor editable={false}` for each comment body with `normalizeCommentBody()`. _Files: `apps/web/src/features/issues/CommentsSection.tsx`_
- [x] **Comment editor** — CommentsSection already uses RichTextEditor with toolbar for new comments (with draft persistence). _Files: `apps/web/src/features/issues/CommentsSection.tsx`_
- [x] **Render project descriptions** — ProjectDetailPage already uses RichTextEditor read-only with click-to-edit (pencil icon). _Files: `apps/web/src/features/projects/ProjectDetailPage.tsx`_
- [x] **Add image support** — Image extension configured, supports paste & drop upload via `/attachments/upload` and `/attachments/upload/generic`. _Files: `apps/web/src/components/RichTextEditor.tsx`_
- [x] **Add toolbar** — Full toolbar: Bold, Italic, Strikethrough, H1/H2/H3, Bullet/Ordered List, Blockquote, Code Block, Link, Image. _Files: `apps/web/src/components/RichTextEditor.tsx`_
- [x] **Empty state** — Placeholder text via TipTap Placeholder extension ("Add a description..." / "Write a comment..." / "Write something..."). Issue description shows "Click to add a description..." when empty. _Files: `apps/web/src/components/RichTextEditor.tsx`, `apps/web/src/features/issues/IssueDetailPage.tsx`_

### Tests

- [x] **Visual check: TipTap JSON renders** — No JSON blobs visible anywhere. Descriptions and comments render formatted text.
- [x] **E2E: create comment with rich text** — Covered in existing `permissions.e2e-spec.ts` and `phase3.e2e-spec.ts` — POST comment with TipTap JSON body, GET returns same structure.
- [x] **E2E: update description with rich text** — Covered in existing `projects-issues.e2e-spec.ts` — PATCH issue description with JSON, verify persistence.

## Acceptance Criteria

- [x] Issue descriptions render as formatted text (headings, bold, lists, links, code)
- [x] Comments render as formatted text
- [x] Click-to-edit on descriptions opens TipTap editor with toolbar
- [x] New comment form has rich text toolbar
- [x] Images can be uploaded and embedded
- [x] No raw JSON visible anywhere in the UI

## Dependencies

- None
