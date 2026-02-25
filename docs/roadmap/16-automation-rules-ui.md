# Automation Rules UI

> Visual rule builder for creating and managing automation rules.

## Why
The automation engine (feature 15) is useless without a UI. Non-technical users need a visual builder like Jira's automation or Zapier.

## Current State
- No automation UI
- Will depend on automation engine backend (feature 15)

## Tasks

### Frontend
- [ ] **Automation list page** — Route: `/admin/automations` (admin only) and `/projects/:key/settings` automations tab. List rules with: name, trigger description, enabled toggle, last executed, edit/delete. _Files: `apps/web/src/features/admin/AutomationsPage.tsx`_
- [ ] **Rule builder dialog** — Multi-step form: 1) Name + trigger selector, 2) Condition builder (add/remove conditions), 3) Action builder (add/remove/reorder actions), 4) Review + save. _Files: `apps/web/src/features/admin/RuleBuilder.tsx`_
- [ ] **Trigger selector** — Dropdown grouped by category: Issue (created, updated, transitioned, assigned, commented), Sprint (started, completed), Schedule (daily, weekly, custom cron). _Files: `apps/web/src/features/admin/TriggerSelector.tsx`_
- [ ] **Condition builder** — Rows of: field selector, operator (equals, not equals, empty, contains), value input. AND logic between rows. Add/remove buttons. _Files: `apps/web/src/features/admin/ConditionBuilder.tsx`_
- [ ] **Action builder** — Sortable list of actions. Each action has a type dropdown and config form (field+value for set_field, status selector for transition, text for comment, etc.). Add/remove buttons. _Files: `apps/web/src/features/admin/ActionBuilder.tsx`_
- [ ] **Execution log viewer** — Expandable section on rule detail showing recent executions with timestamp, trigger, success/failure, error message. _Files: `apps/web/src/features/admin/AutomationLog.tsx`_
- [ ] **API hooks** — `useAutomations(projectId?)`, `useCreateAutomation()`, `useUpdateAutomation(id)`, `useDeleteAutomation(id)`, `useAutomationLog(ruleId)`. _Files: `apps/web/src/api/hooks-automations.ts`_
- [ ] **Navigation** — Add "Automations" to admin sidebar under Administration. _Files: `apps/web/src/layouts/AppLayout.tsx`_

### Tests
- [ ] **Manual: full rule creation flow** — Create a rule via UI, verify it appears in list, toggle enable/disable, delete.

## Acceptance Criteria
- Admin can create automation rules via visual builder
- Triggers, conditions, actions selectable from dropdowns
- Rules can be enabled/disabled with toggle
- Execution log shows recent history
- Rule can be scoped to project or global
- Non-admin users cannot access automation management

## Dependencies
- 15-automation-engine (backend must exist)
