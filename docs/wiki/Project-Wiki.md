# Write and organize project documentation

Open a project's **Wiki** to keep instructions, decisions, and reference material beside its issues. Pages can contain rich text, sit beneath other pages, and keep earlier versions. Your project access and page permissions determine what you can read or change.

## Create and edit a page

Choose **New page**, give it a clear title, and write the content. Put the answer or procedure first, then the background. A short page that solves one problem is easier to maintain than a single page for everything.

The editor autosaves after roughly two seconds without changes and also provides **Save**. Wait for **Saved** before leaving, especially after a long edit. A failed save keeps the draft in the current editor and displays an error; that does not guarantee the draft will survive closing the browser.

To change an existing page, select it from the tree and choose **Edit**. Use the rich-text toolbar for headings, lists, links, and code. See [Collaboration and Notifications](https://github.com/jakwinkler/weaver/wiki/Collaboration-and-Notifications) for the difference between saved-record refresh and simultaneous editing.

![A project handbook with nested pages and its version history](https://raw.githubusercontent.com/wiki/jakwinkler/weaver/images/wiki.png)

*Launch handbook contains Launch checklist and Support handoff. History opens alongside the current page.*

## Organize and find pages

Use a page's child-page action to add a page beneath it. Expand or collapse branches in the tree. Use drag-and-drop or the **Move** controls to adjust placement. A page cannot become its own descendant.

Search the wiki to find matching page titles and body content. Search is scoped to this project. It is separate from the application-wide issue/project search.

## Review or restore an earlier version

Choose **History**, select a saved version, and compare its content with the current version. If you have update permission, use the restore action to make the selected content current. Restoration is a new change to the page; it is not a private preview.

The comparison shows selected and current content. It does not provide a character-by-character source-control diff. Check the title and body before restoring, especially if someone else has edited the page recently.

## Delete carefully

Deleting a page asks for confirmation. Its child pages move up one level rather than disappearing with it. History is useful for revisions to existing pages; do not treat it as a recycle bin for deleted pages.

This project Wiki is for team content. [The GitHub documentation wiki](https://github.com/jakwinkler/weaver/wiki/Home) explains the product itself.

---

## Technical reference (developers and LLMs)

The guidance above covers everyday use. The details below explain API contracts, implementation, and operational limits.

Page routes are beneath `/projects/:projectKey/pages`. The API supports create/list, `/tree`, `/search`, read/update/delete by `:slug`, version history, and restore. The web route uses `/projects/:projectKey/wiki?page=<slug>`.

Bodies are TipTap JSON objects. Pages store `parentId` and `sortOrder`; title-derived slugs are unique within a project. Changing the title does not require callers to invent a new slug. Parent validation blocks cross-project nesting and cycles.

The server stores the prior title/body when updating and records a version when restoring. Default role permissions give members page read/create/update and viewers page read. Permission checks remain on the API, alongside project-access checks.

### Source reference

Checked against source revision [`1b1b370`](https://github.com/jakwinkler/weaver/commit/1b1b3704c37b4d1ab09347508d57968e1de38130).

- [apps/web/src/features/wiki/WikiPage.tsx](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/web/src/features/wiki/WikiPage.tsx)
- [apps/web/src/features/wiki/PageEditor.tsx](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/web/src/features/wiki/PageEditor.tsx)
- [apps/web/src/features/wiki/VersionHistory.tsx](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/web/src/features/wiki/VersionHistory.tsx)
- [apps/api/src/modules/pages/pages.controller.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/api/src/modules/pages/pages.controller.ts)
- [apps/api/src/modules/pages/pages.service.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/api/src/modules/pages/pages.service.ts)
