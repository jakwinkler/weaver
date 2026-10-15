# Import from Jira

Use **Administration → Import / Export → Import from Jira** to move projects and their work into Weaver. Start with one representative project in a disposable organization, then compare the result with Jira before a broader migration.

The importer supports Jira Cloud and Jira Server/Data Center code paths. Its wizard was checked locally; this documentation walkthrough did not connect to a real Jira account or certify a complete migration.

## Prepare the trial

Choose a Jira account that can read the selected projects and their attachments. Keep the source available while validating the import. Record the project keys and approximate counts you expect, and take a backup of any existing Weaver destination before importing into it.

A useful sample includes formatted descriptions, comments, attachments, assignees, custom fields, and at least one sprint. The point of the trial is to expose mapping or permission gaps while the affected set is small.

## Follow the wizard

1. **Source:** choose Jira Cloud or Jira Server / Data Center.
2. **Credentials:** enter the Jira URL and supported credentials. Cloud API-token authentication also needs the Atlassian account email. Server/Data Center supports a personal access token; the UI also accepts an OAuth access token.
3. **Connect:** test access and load available projects.
4. **Projects:** choose the projects to import. Check whether “all projects” is selected before continuing.
5. **Review:** confirm the source and selection, then start the import.

![The Jira import wizard at its source-selection step](https://raw.githubusercontent.com/wiki/jakwinkler/weaver/images/jira-import.png)

*The wizard separates source, credentials, connection, project selection, and review. No real Jira credentials appear in this screenshot.*

The import runs in the background. Watch the progress and error list. Returning to the page can resume progress tracking in the same browser session. **Cancel** requests a stop; it does not remove everything that was already imported.

## Validate the result

Compare a few issues in detail, not just the total count. Check summaries, description formatting, priorities, statuses, labels, dates, story points, comments, and downloadable attachments. Confirm assignees and reporters map to the intended people. Check sprint membership and dates separately.

Jira keys are preserved when possible. Conflicts can produce new keys. The importer tracks source IDs to reduce duplicates on re-import, but that is not a guarantee of continuous two-way synchronization or a universal rollback. Review what already exists before rerunning.

## File import and export

The same page also offers CSV and JSON issue import/export for a selected project. This is a simpler file workflow, separate from the Jira migration pipeline. Inspect its preview and field behavior before importing. Issue export is not a complete backup of an organization, its files, plugins, or settings.

---

## Technical reference (developers and LLMs)

The guidance above covers everyday use. The details below explain API contracts, implementation, and operational limits.

The Jira API surface includes `POST /import/jira/projects` for discovery, `POST /import/jira/start`, `GET /import/status/:id`, and `POST /import/jira/cancel/:id`. Requests use a `config` with `source`, `baseUrl`, and `auth`; import start can include `projectKeys`. Confirm route names against the controller linked below when writing a client.

The shared Jira import package handles source parsing and mapping. Cloud uses REST v3 and Server/Data Center uses v2. ADF content is converted to TipTap-compatible content. Assignee resolution, unmapped fields, attachments, project key collisions, and sprint imports deserve explicit trial checks.

The worker processes import jobs through BullMQ. In the pilot release, the API seals queued job data before it enters Redis, and the worker rejects unencrypted jobs. The API and worker must share `IMPORT_CREDENTIAL_KEY`, a base64-encoded 32-byte key supplied through the installation's secret store. Drain pending imports before rotating it. Treat queue storage and logs as sensitive because the workflow handles source credentials. The UI clears its credential field after queuing and retains an import ID in session storage; this does not mean every infrastructure layer is credential-free.

### Source reference

Checked against source revision [`1b1b370`](https://github.com/jakwinkler/weaver/commit/1b1b3704c37b4d1ab09347508d57968e1de38130).

- [apps/web/src/features/settings/ImportWizard.tsx](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/web/src/features/settings/ImportWizard.tsx)
- [apps/web/src/features/settings/ImportProgress.tsx](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/web/src/features/settings/ImportProgress.tsx)
- [apps/api/src/modules/import/import.controller.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/api/src/modules/import/import.controller.ts)
- [apps/api/src/modules/import/import.schemas.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/api/src/modules/import/import.schemas.ts)
- [apps/api/src/modules/import/import-orchestrator.service.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/api/src/modules/import/import-orchestrator.service.ts)
- [apps/worker/src/processors/import.processor.ts](https://github.com/jakwinkler/weaver/blob/1b1b3704c37b4d1ab09347508d57968e1de38130/apps/worker/src/processors/import.processor.ts)

Pilot update checked against [`ce5494a`](https://github.com/jakwinkler/weaver/commit/ce5494a445f0a5412cf7e0be378308afbeb5e5f8): [import queue](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/apps/api/src/modules/import/import-queue.service.ts), [worker processor](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/apps/worker/src/processors/import.processor.ts).
