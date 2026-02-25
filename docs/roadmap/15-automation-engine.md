# Automation Engine

> Rule-based automation: "When [trigger] and [condition], then [action]" — wired into workflows and the event system.

## Why
This is the single most impactful feature for power users. Jira, ClickUp, and Monday all have automation engines. It eliminates repetitive work (auto-assign, auto-transition, auto-label, notify on overdue).

## Current State
- WorkflowTransitionEntity has `conditions`, `validators`, `postFunctions` JSONB arrays (defined but unused)
- Plugin SDK defines `registerWorkflowConditions()` and `registerWorkflowPostFunctions()` (never called)
- EventDispatcher emits domain events (issue.created, issue.updated, etc.)
- BullMQ worker processes async jobs

## Tasks

### Backend
- [ ] **Create AutomationRule entity** — Fields: id, projectId (nullable = global), name, enabled, trigger (JSONB), conditions (JSONB[]), actions (JSONB[]), createdBy, createdAt. _Files: `packages/db/src/entities/tenant/automation-rule.entity.ts`_
- [ ] **Define trigger types** — `{ type: 'issue.created' }`, `{ type: 'issue.updated', field: 'statusId' }`, `{ type: 'issue.updated', field: 'assigneeId' }`, `{ type: 'sprint.started' }`, `{ type: 'schedule', cron: '...' }`. _Files: `apps/api/src/modules/automations/automation.types.ts`_
- [ ] **Define condition types** — `{ type: 'field_equals', field: 'priority', value: 'high' }`, `{ type: 'field_empty', field: 'assigneeId' }`, `{ type: 'status_category', value: 'done' }`, `{ type: 'issue_type', value: 'bug' }`. _Files: `apps/api/src/modules/automations/automation.types.ts`_
- [ ] **Define action types** — `{ type: 'set_field', field: 'assigneeId', value: '...' }`, `{ type: 'transition', statusId: '...' }`, `{ type: 'add_label', label: '...' }`, `{ type: 'add_comment', body: '...' }`, `{ type: 'send_notification', userId: '...' }`, `{ type: 'webhook', url: '...' }`. _Files: `apps/api/src/modules/automations/automation.types.ts`_
- [ ] **Automation evaluation service** — Subscribe to EventDispatcher. For each event: load matching rules (by trigger type + project), evaluate conditions, execute actions in sequence. Run in BullMQ job for isolation. _Files: `apps/api/src/modules/automations/automation-engine.service.ts`_
- [ ] **Action executor** — Switch on action type. Each action calls the corresponding service method (issues.update, comments.create, notifications.create, etc.). _Files: `apps/api/src/modules/automations/action-executor.service.ts`_
- [ ] **Guard against loops** — Track execution chain depth. If an action triggers another automation, allow max 5 levels deep. _Files: `apps/api/src/modules/automations/automation-engine.service.ts`_
- [ ] **Automation CRUD endpoints** — `POST/GET/PATCH/DELETE /automations`. Scoped to project or global. _Files: `apps/api/src/modules/automations/automations.controller.ts`, `apps/api/src/modules/automations/automations.service.ts`_
- [ ] **Automation module** — Register entity, service, controller. _Files: `apps/api/src/modules/automations/automations.module.ts`_
- [ ] **Wire workflow post-functions** — When issue transitions, execute post-functions defined on the transition. Post-functions use the same action format as automations. _Files: `apps/api/src/modules/issues/issues.service.ts`_
- [ ] **Wire workflow conditions** — Before allowing transition, evaluate conditions on the transition. Reject with 400 if conditions fail. _Files: `apps/api/src/modules/issues/issues.service.ts`_
- [ ] **Execution log** — Store last 100 automation executions per rule: `{ ruleId, triggeredBy, triggeredAt, actionsExecuted, success, error? }`. _Files: `apps/api/src/modules/automations/automation-log.entity.ts`_

### Tests
- [ ] **E2E: rule triggers on event** — Create rule "when issue created and priority=high, set label 'urgent'". Create high-priority issue. Verify label set. _File: `apps/api/test/automations.e2e-spec.ts`_
- [ ] **E2E: conditions filter** — Same rule but create medium-priority issue. Verify label NOT set. _File: `apps/api/test/automations.e2e-spec.ts`_
- [ ] **E2E: multiple actions** — Rule with 2 actions (set label + add comment). Verify both executed. _File: `apps/api/test/automations.e2e-spec.ts`_
- [ ] **E2E: loop guard** — Rule A triggers Rule B triggers Rule A. Verify stops at max depth. _File: `apps/api/test/automations.e2e-spec.ts`_
- [ ] **E2E: disabled rule** — Disable rule, trigger event, verify no action. _File: `apps/api/test/automations.e2e-spec.ts`_
- [ ] **E2E: CRUD permissions** — Only admin can create/update/delete rules. _File: `apps/api/test/automations.e2e-spec.ts`_
- [ ] **E2E: workflow conditions** — Add condition to transition, attempt transition when condition fails, expect 400. _File: `apps/api/test/automations.e2e-spec.ts`_

## Acceptance Criteria
- Rules can be created with trigger + conditions + actions
- Rules fire automatically when events occur
- Conditions filter which events match
- Actions execute in sequence
- Loop protection prevents infinite chains
- Disabled rules don't fire
- Workflow transitions respect conditions
- Workflow post-functions execute on transition
- Execution log tracks success/failure

## Dependencies
- None (core infrastructure)
