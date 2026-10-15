# Rich Text Rendering

**Status: Implemented.** Rich text is edited and rendered on issue, comment, and project surfaces.

Reconciled September 23, 2026 against main [`27b14d7`](https://github.com/jakwinkler/weaver/commit/27b14d72ab8d201c4bf4fcbffd00830091dd21ce). This is the source baseline, which can differ from the checked-out application branch. Checked implementation items below mean the code exists; they do not certify a release or a fresh test pass.

User guide: [Working with Issues](https://github.com/jakwinkler/weaver/wiki/Working-with-Issues).

## Implemented

- [x] Read-only RichTextRenderer and normalization for TipTap JSON, legacy text, and empty content.
- [x] Issue description editing with explicit Save/Cancel; formatted comments and activity content.
- [x] Project detail/settings rendering and readable text extraction for list/public summaries.
- [x] Formatting toolbar, links, images, paste/drop uploads, and nullable description clearing.

## Differences from the original plan

- The renderer exists; descriptions/comments no longer rely on exposing stored JSON.
- Public/list summaries deliberately extract text instead of exposing private rich-text attachment URLs.
- The former blanket claim that no raw JSON is visible anywhere is an acceptance target for each surface, not proof about every future screen.

## Remaining work and verification

- [ ] Repeat paste/drop upload and attachment authorization checks after storage or editor changes.
- [ ] Retain browser coverage for empty, legacy, malformed, and freshly updated documents.

## Evidence

Formatted issue descriptions, comments, and project wiki pages rendered in the local documentation walkthrough. Earlier roadmap browser results are historical; no editor suite was rerun for this edit.

### Implementation

- [apps/web/src/components/RichTextEditor.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/components/RichTextEditor.tsx)
- [apps/web/src/lib/richText.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/lib/richText.ts)
- [apps/web/src/features/issues/IssueDetailPage.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/features/issues/IssueDetailPage.tsx)

### Existing automated coverage, not rerun for this documentation edit

- [apps/web/src/components/RichTextRenderer.test.tsx](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/components/RichTextRenderer.test.tsx)
- [apps/web/src/lib/richText.test.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/web/src/lib/richText.test.ts)
- [apps/api/test/projects-issues.e2e-spec.ts](https://github.com/jakwinkler/weaver/blob/27b14d72ab8d201c4bf4fcbffd00830091dd21ce/apps/api/test/projects-issues.e2e-spec.ts)

## Dependencies

- None
