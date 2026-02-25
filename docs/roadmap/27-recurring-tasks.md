# Recurring Tasks

> Issues that automatically recreate on a schedule: daily standup prep, weekly review, monthly report.

## Why
Recurring tasks eliminate the need to manually create the same issue every week/month. ClickUp, Monday, and Todoist all support this. Common use case: weekly team review, monthly report prep, sprint ceremonies.

## Current State
- Issues have full CRUD
- No recurrence concept or scheduler
- BullMQ worker exists for async jobs

## Tasks

### Backend
- [ ] **Add recurrence fields to IssueEntity** — `recurrenceRule` (JSONB, nullable): `{ frequency: 'daily' | 'weekly' | 'monthly', interval: number, daysOfWeek?: number[], dayOfMonth?: number, endDate?: string, maxOccurrences?: number }`. `recurrenceParentId` (UUID, nullable): links to original issue. _Files: `packages/db/src/entities/tenant/issue.entity.ts`_
- [ ] **Recurrence scheduler** — BullMQ repeatable job (runs daily at midnight). Query all issues with active recurrenceRule. For each due recurrence: clone issue (same project, type, assignee, labels, priority), clear status to initial, set new dates, increment occurrence count. _Files: `apps/api/src/modules/issues/recurrence.service.ts`_
- [ ] **Include recurrence in issue create/update** — Allow setting recurrenceRule on issue creation and update. Validate structure. _Files: `apps/api/src/modules/issues/issues.controller.ts`, `packages/shared/src/schemas/index.ts`_
- [ ] **Stop recurrence** — Setting `recurrenceRule` to null stops future recurrences. Also stop if maxOccurrences reached or endDate passed. _Files: `apps/api/src/modules/issues/recurrence.service.ts`_
- [ ] **Recurrence chain** — New recurring issues link back to parent via `recurrenceParentId`. GET /issues/:key/recurrence returns all instances. _Files: `apps/api/src/modules/issues/issues.service.ts`_

### Frontend
- [ ] **Recurrence picker** — In issue detail sidebar and create form: dropdown to set frequency (none, daily, weekly, monthly), interval, end condition (never, after N occurrences, on date). _Files: `apps/web/src/components/RecurrencePicker.tsx`_
- [ ] **Recurrence indicator** — Show repeat icon on recurring issues in list and board views. _Files: `apps/web/src/features/issues/IssueListPage.tsx`, `apps/web/src/features/boards/KanbanBoard.tsx`_
- [ ] **Recurrence history** — In issue detail, link to "View all occurrences" showing past/future instances. _Files: `apps/web/src/features/issues/IssueDetailPage.tsx`_

### Tests
- [ ] **E2E: set recurrence** — Create issue with weekly recurrence, verify recurrenceRule stored. _File: `apps/api/test/recurring-tasks.e2e-spec.ts`_
- [ ] **E2E: recurrence creates new issue** — Manually trigger scheduler, verify new issue created with recurrenceParentId. _File: `apps/api/test/recurring-tasks.e2e-spec.ts`_
- [ ] **E2E: max occurrences** — Set maxOccurrences=2, trigger twice, verify no third creation. _File: `apps/api/test/recurring-tasks.e2e-spec.ts`_
- [ ] **E2E: stop recurrence** — Set recurrenceRule to null, verify scheduler skips. _File: `apps/api/test/recurring-tasks.e2e-spec.ts`_

## Acceptance Criteria
- Issues can have recurrence rules (daily, weekly, monthly)
- Scheduler auto-creates new issue instances
- New instances link back to parent
- Recurrence stops at max occurrences or end date
- Recurrence icon visible on recurring issues
- Can view all occurrences from any instance
- Can stop recurrence by clearing rule

## Dependencies
- None
