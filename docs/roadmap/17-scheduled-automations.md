# Scheduled Automations

> Cron-based triggers for automation rules: "Every day at 9am, notify assignees of overdue issues."

## Why
Not all automation is event-driven. Scheduled tasks handle: overdue alerts, stale issue cleanup, weekly digests, SLA monitoring.

## Current State
- BullMQ worker exists for async jobs
- Automation engine (feature 15) defines trigger types including `{ type: 'schedule', cron: '...' }`
- No cron scheduler exists

## Tasks

### Backend
- [ ] **Cron scheduler service** — On app startup, load all enabled automation rules with `type: 'schedule'` triggers. Register each with BullMQ's repeatable job feature (cron syntax). On rule create/update/delete, update the repeatable job. _Files: `apps/api/src/modules/automations/automation-scheduler.service.ts`_
- [ ] **Schedule trigger context** — When cron fires, create synthetic event `{ type: 'schedule.fired', ruleId }`. Pass to automation engine for condition evaluation and action execution. _Files: `apps/api/src/modules/automations/automation-scheduler.service.ts`_
- [ ] **Predefined schedules** — Support both cron syntax and named schedules: `daily_9am`, `weekly_monday`, `hourly`, `every_15m`. _Files: `apps/api/src/modules/automations/automation.types.ts`_
- [ ] **Query-based conditions for scheduled rules** — Allow conditions like `{ type: 'query', field: 'dueDate', operator: 'before', value: 'now' }` to find overdue issues. The action runs once per matching issue. _Files: `apps/api/src/modules/automations/automation-engine.service.ts`_
- [ ] **Tenant iteration** — Scheduled rules must run for each tenant that has them. Load tenants with the rule's plugin/automation, iterate. _Files: `apps/api/src/modules/automations/automation-scheduler.service.ts`_

### Worker
- [ ] **Process scheduled automation jobs** — New processor in worker that receives cron-fired jobs and delegates to automation engine. _Files: `apps/worker/src/processors/automation.processor.ts`_

### Frontend
- [ ] **Schedule trigger in rule builder** — When "Schedule" trigger selected, show: named schedule dropdown OR custom cron input with preview ("Runs every day at 9:00 AM"). _Files: `apps/web/src/features/admin/TriggerSelector.tsx`_
- [ ] **Cron preview** — Parse cron expression and show human-readable text ("Every weekday at 9:00 AM UTC"). _Files: `apps/web/src/features/admin/CronPreview.tsx`_

### Tests
- [ ] **E2E: scheduled rule creation** — Create rule with schedule trigger, verify stored correctly. _File: `apps/api/test/scheduled-automations.e2e-spec.ts`_
- [ ] **E2E: manual schedule trigger** — Fire schedule manually (test endpoint), verify actions executed. _File: `apps/api/test/scheduled-automations.e2e-spec.ts`_
- [ ] **E2E: query condition** — Schedule rule with "dueDate before now" condition, create overdue issue, fire, verify action ran. _File: `apps/api/test/scheduled-automations.e2e-spec.ts`_

## Acceptance Criteria
- Automation rules can have schedule-based triggers (cron)
- Named schedules available (daily, weekly, etc.)
- Custom cron expression supported
- Scheduled rules evaluate conditions against matching issues
- Actions run per matching issue
- Cron preview shows human-readable schedule

## Dependencies
- 15-automation-engine (core engine)
- 16-automation-rules-ui (trigger selector)
