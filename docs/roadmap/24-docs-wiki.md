# Docs & Wiki

> Project-scoped wiki pages with rich text, tree navigation, and full-text search.

## Why
Teams need documentation alongside their issues. ClickUp Docs, Monday Docs, and Notion prove that inline docs are a major value add. Without them, teams use a separate tool.

## Current State
- Rich text editor (TipTap) exists
- Attachment upload system works
- No document/page entity or endpoints
- No wiki navigation

## Tasks

### Backend
- [ ] **Create PageEntity** — Fields: id, projectId, title, slug (auto from title), body (JSONB, TipTap), parentId (nullable, for nesting), sortOrder, createdBy, updatedAt, createdAt. Tree structure via parentId. _Files: `packages/db/src/entities/tenant/page.entity.ts`_
- [ ] **Pages CRUD endpoints** — `POST /projects/:key/pages` (create), `GET /projects/:key/pages` (list tree), `GET /projects/:key/pages/:slug` (read), `PATCH /projects/:key/pages/:slug` (update), `DELETE /projects/:key/pages/:slug` (delete with children reassignment). _Files: `apps/api/src/modules/pages/pages.controller.ts`, `apps/api/src/modules/pages/pages.service.ts`, `apps/api/src/modules/pages/pages.module.ts`_
- [ ] **Page tree endpoint** — `GET /projects/:key/pages/tree` returns nested structure: `[{ id, title, slug, children: [...] }]`. _Files: `apps/api/src/modules/pages/pages.service.ts`_
- [ ] **Page search** — Full-text search across page titles and body content. _Files: `apps/api/src/modules/pages/pages.service.ts`_
- [ ] **Page version history** — Store previous versions in `page_versions` table. `GET /projects/:key/pages/:slug/history` returns versions. _Files: `packages/db/src/entities/tenant/page-version.entity.ts`, `apps/api/src/modules/pages/pages.service.ts`_
- [ ] **Permissions** — `@RequirePermission('pages', 'create')`, `'pages.read'`, `'pages.update'`, `'pages.delete'`. Add to seeded roles: member gets read+create+update, viewer gets read. _Files: `apps/api/src/modules/pages/pages.controller.ts`_

### Frontend
- [ ] **Wiki page** — Route: `/projects/:projectKey/wiki`. Left sidebar: page tree with collapsible nodes. Main area: page content. _Files: `apps/web/src/features/wiki/WikiPage.tsx`_
- [ ] **Page tree navigation** — Collapsible tree component. Click to navigate. Drag to reorder/reparent. "New page" button at root and under each node. _Files: `apps/web/src/features/wiki/PageTree.tsx`_
- [ ] **Page viewer** — RichTextRenderer for page body. Title displayed as h1. Breadcrumb from root. Edit button. _Files: `apps/web/src/features/wiki/PageViewer.tsx`_
- [ ] **Page editor** — Full-page RichTextEditor with toolbar. Auto-save with debounce (2s after last keystroke). Manual save button. _Files: `apps/web/src/features/wiki/PageEditor.tsx`_
- [ ] **Version history** — Side panel showing previous versions with timestamps and authors. Click to view diff or restore. _Files: `apps/web/src/features/wiki/VersionHistory.tsx`_
- [ ] **Add to project navigation** — Add "Wiki" tab in project detail page. _Files: `apps/web/src/features/projects/ProjectDetailPage.tsx`_
- [ ] **Wiki search** — Search bar in wiki sidebar. Results highlight matching pages. _Files: `apps/web/src/features/wiki/WikiPage.tsx`_

### Tests
- [ ] **E2E: page CRUD** — Create page, read, update, delete. Verify tree structure. _File: `apps/api/test/wiki.e2e-spec.ts`_
- [ ] **E2E: nested pages** — Create parent, create child under parent, verify tree endpoint returns nesting. _File: `apps/api/test/wiki.e2e-spec.ts`_
- [ ] **E2E: version history** — Update page 3 times, verify 3 versions in history. _File: `apps/api/test/wiki.e2e-spec.ts`_
- [ ] **E2E: permissions** — Viewer can read but not create pages. _File: `apps/api/test/wiki.e2e-spec.ts`_

## Acceptance Criteria
- Wiki accessible per project
- Pages stored as rich text (TipTap JSON)
- Tree navigation with nesting
- Auto-save while editing
- Version history with restore
- Full-text search across pages
- Permission-gated (viewer=read, member=read+write)
- Drag to reorder pages in tree

## Dependencies
- 02-rich-text (TipTap rendering and editing)
