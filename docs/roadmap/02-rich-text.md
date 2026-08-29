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

- [x] **Create RichTextRenderer component** — Dedicated read-only wrapper renders normalized TipTap documents and refreshes when query content changes. Supports headings, bold, italic, code, links, lists, blockquotes, images, and code blocks via StarterKit plus extensions. _Files: `apps/web/src/components/RichTextEditor.tsx`, `apps/web/src/lib/richText.ts`_
- [x] **Render issue descriptions** — IssueDetailPage uses `RichTextRenderer`; click-to-edit switches to the full editor with Save/Cancel buttons. _Files: `apps/web/src/features/issues/IssueDetailPage.tsx`_
- [x] **Render comments** — Comments and all-activity entries use `RichTextRenderer` with legacy body normalization. _Files: `apps/web/src/features/issues/CommentsSection.tsx`, `apps/web/src/features/issues/IssueActivityTabs.tsx`_
- [x] **Comment editor** — CommentsSection already uses RichTextEditor with toolbar for new comments (with draft persistence). _Files: `apps/web/src/features/issues/CommentsSection.tsx`_
- [x] **Render project descriptions** — Authenticated project detail and settings pages render rich text. Project-list and public-page summaries extract readable text instead of exposing stored JSON or private attachment URLs. _Files: `apps/web/src/features/projects/ProjectDetailPage.tsx`, `apps/web/src/features/projects/ProjectSettingsPage.tsx`, `apps/web/src/features/projects/ProjectsPage.tsx`, `apps/web/src/features/projects/PublicProjectPage.tsx`_
- [x] **Add image support** — Image extension supports paste and drop upload via `/issues/:issueKey/attachments` and `/attachments/upload`. _Files: `apps/web/src/components/RichTextEditor.tsx`_
- [x] **Add toolbar** — Full toolbar: Bold, Italic, Strikethrough, H1/H2/H3, Bullet/Ordered List, Blockquote, Code Block, Link, Image. _Files: `apps/web/src/components/RichTextEditor.tsx`_
- [x] **Empty state** — Placeholder text via TipTap Placeholder extension. Empty and whitespace-only documents are detected consistently, descriptions can be cleared to `null`, and the issue page restores "Click to add a description...". _Files: `apps/web/src/lib/richText.ts`, `apps/web/src/features/issues/IssueDetailPage.tsx`, `packages/shared/src/schemas/index.ts`_

### Tests

- [x] **Visual check: TipTap JSON renders** — Local browser acceptance covers project list/detail, issue detail, comments, empty state, pasted image upload, and a direct raw-JSON visibility check.
- [x] **Component: rich-text rendering** — Vitest verifies heading, bold, link, list, and code-block output, plus read-only refresh behavior. _Files: `apps/web/src/components/RichTextRenderer.test.tsx`_
- [x] **Unit: normalization and empty state** — Vitest covers stored JSON strings, legacy text, malformed content, readable extraction, non-text content, and empty serialization. _Files: `apps/web/src/lib/richText.test.ts`_
- [x] **E2E: create comment with rich text** — Existing API suites POST comment bodies as TipTap JSON and verify the returned structure.
- [x] **E2E: update description with rich text** — Focused API e2e persists, refetches, and clears a formatted TipTap description. _Files: `apps/api/test/projects-issues.e2e-spec.ts`_

## Acceptance Criteria

- [x] Issue descriptions render as formatted text (headings, bold, lists, links, code)
- [x] Comments render as formatted text
- [x] Click-to-edit on descriptions opens TipTap editor with toolbar
- [x] New comment form has rich text toolbar
- [x] Images can be uploaded and embedded
- [x] No raw JSON visible anywhere in the UI

## Dependencies

- None
