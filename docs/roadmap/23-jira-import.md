# Jira Import

> Import projects, issues, workflows, comments, and attachments from Jira Cloud or Jira Server.

## Why
The #1 question for any Jira alternative is "can I migrate my data?" A smooth import experience is the difference between people trying Weaver and actually switching. No one wants to re-enter 1000 issues.

## Current State
- Import/export page exists in UI (empty)
- No import endpoints or services
- Data model is compatible with Jira's (projects, issues with keys, workflows, sprints, comments)

## Tasks

### Backend
- [ ] **Jira API client service** — Connect to Jira Cloud REST API v3 or Jira Server REST API v2. Authenticate with API token or OAuth. Paginate through all resources. _Files: `apps/api/src/modules/import/jira-client.service.ts`_
- [ ] **Import orchestrator** — Manage the full import pipeline: 1) Fetch projects, 2) Create Weaver projects, 3) Map issue types, 4) Map workflow statuses, 5) Import issues in batches, 6) Import comments, 7) Import attachments, 8) Import sprint data. Track progress. _Files: `apps/api/src/modules/import/import-orchestrator.service.ts`_
- [ ] **Field mapping** — Map Jira fields to Weaver fields: summary, description (convert ADF to TipTap JSON), priority, status, assignee (by email match), reporter, labels, dates, story points. Unmapped fields → custom fields. _Files: `apps/api/src/modules/import/field-mapper.service.ts`_
- [ ] **Import state entity** — Track import progress: `{ id, source, status, progress, totalItems, importedItems, errors, startedAt, completedAt }`. _Files: `packages/db/src/entities/tenant/import-job.entity.ts`_
- [ ] **Import endpoints** — `POST /import/jira/start` (begin import with Jira credentials + project selection), `GET /import/status/:id` (poll progress), `POST /import/jira/cancel/:id`. _Files: `apps/api/src/modules/import/import.controller.ts`_
- [ ] **Run in worker** — Import runs as BullMQ job. Large imports can take minutes — must not block API. _Files: `apps/worker/src/processors/import.processor.ts`_
- [ ] **Issue key preservation** — Attempt to preserve Jira issue keys (PROJ-123). If conflict, generate new keys. _Files: `apps/api/src/modules/import/import-orchestrator.service.ts`_
- [ ] **Idempotency** — Track imported Jira IDs to prevent duplicates on re-import. _Files: `apps/api/src/modules/import/import-orchestrator.service.ts`_

### Frontend
- [ ] **Import wizard** — Multi-step form in ImportExportPage: 1) Select source (Jira Cloud/Server), 2) Enter credentials (URL + API token), 3) Test connection + show available projects, 4) Select projects to import, 5) Review mapping + start. _Files: `apps/web/src/features/settings/ImportWizard.tsx`_
- [ ] **Progress view** — Real-time progress bar with: items imported, current step, errors list. Auto-refresh every 2 seconds. _Files: `apps/web/src/features/settings/ImportProgress.tsx`_
- [ ] **Import hooks** — `useStartJiraImport()`, `useImportStatus(id)`, `useCancelImport(id)`. _Files: `apps/web/src/api/hooks-import.ts`_

### Tests
- [ ] **E2E: import endpoint accepts valid config** — POST /import/jira/start with mock config, verify job created. _File: `apps/api/test/jira-import.e2e-spec.ts`_
- [ ] **Unit: field mapping** — Jira priority "Highest" → Weaver "highest". Jira ADF description → TipTap JSON. _File: `apps/api/src/modules/import/__tests__/field-mapper.test.ts`_
- [ ] **Unit: key preservation** — Jira key "PROJ-42" preserved when no conflict. New key generated on conflict. _File: `apps/api/src/modules/import/__tests__/import-orchestrator.test.ts`_

## Acceptance Criteria
- Import wizard connects to Jira Cloud and Server
- User selects which projects to import
- Issues, comments, attachments, sprints imported
- Jira issue keys preserved when possible
- Workflow statuses mapped to Weaver statuses
- Import runs in background with progress tracking
- Errors logged and displayed (don't block other items)
- Duplicate prevention on re-import

## Dependencies
- None
