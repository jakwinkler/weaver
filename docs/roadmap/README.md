# Weaver Roadmap

> Open-source project management platform — the path to v1.0

## Current State

Weaver has a solid multi-tenant backend (NestJS + TypeORM + BullMQ), a React frontend (Vite + Tailwind v4), and a working plugin system. Core entities (projects, issues, workflows, boards, sprints, comments, custom fields, roles) are all functional with 90+ e2e tests passing.

**What's working today:** CRUD for all entities, permission system, plugin lifecycle, webhook delivery, tenant isolation, basic views (kanban, sprint, gantt, calendar).

**What's missing:** The UX polish, real-time collaboration, automation engine, and developer tooling that separate a demo from a product.

---

## Release Milestones

### v0.5 — Usable (Phase A)
> "Someone could actually use this daily instead of Trello"

| # | Feature | File | Priority | Effort |
|---|---------|------|----------|--------|
| 01 | Drag & Drop | [01-drag-and-drop.md](./01-drag-and-drop.md) | Critical | L |
| 02 | Rich Text Rendering | [02-rich-text.md](./02-rich-text.md) | Critical | M |
| 03 | Real-Time Updates | [03-real-time.md](./03-real-time.md) | High | L |
| 04 | Pagination & Sorting | [04-pagination.md](./04-pagination.md) | High | S |
| 05 | Inline Editing | [05-inline-editing.md](./05-inline-editing.md) | High | M |
| 06 | Keyboard Shortcuts | [06-keyboard-shortcuts.md](./06-keyboard-shortcuts.md) | Medium | S |
| 07 | @Mentions | [07-mentions.md](./07-mentions.md) | Medium | M |
| 08 | Email Notifications | [08-email-notifications.md](./08-email-notifications.md) | High | M |
| 09 | Bulk Operations UI | [09-bulk-operations.md](./09-bulk-operations.md) | Medium | M |

### v0.7 — Agile-Ready (Phase B)
> "A Scrum team could run their sprints here"

| # | Feature | File | Priority | Effort |
|---|---------|------|----------|--------|
| 10 | Backlog & Sprint Planning | [10-backlog-sprint-planning.md](./10-backlog-sprint-planning.md) | Critical | L |
| 11 | Board Swimlanes & WIP Limits | [11-swimlanes-wip.md](./11-swimlanes-wip.md) | High | M |
| 12 | Story Points & Estimation | [12-story-points.md](./12-story-points.md) | High | S |
| 13 | Sprint Reports | [13-sprint-reports.md](./13-sprint-reports.md) | High | L |
| 14 | Roadmap View | [14-roadmap-view.md](./14-roadmap-view.md) | Medium | L |

### v0.8 — Automations (Phase C)
> "Set rules, let the system work for you"

| # | Feature | File | Priority | Effort |
|---|---------|------|----------|--------|
| 15 | Automation Engine | [15-automation-engine.md](./15-automation-engine.md) | Critical | XL |
| 16 | Automation Rules UI | [16-automation-rules-ui.md](./16-automation-rules-ui.md) | Critical | L |
| 17 | Scheduled Automations | [17-scheduled-automations.md](./17-scheduled-automations.md) | Medium | M |

### v0.9 — Plugin System v2 (Phase D)
> "External developers can build and ship plugins"

| # | Feature | File | Priority | Effort |
|---|---------|------|----------|--------|
| 18 | Dynamic Plugin Loading | [18-dynamic-plugin-loading.md](./18-dynamic-plugin-loading.md) | Critical | XL |
| 19 | Plugin Settings UI | [19-plugin-settings-ui.md](./19-plugin-settings-ui.md) | High | M |
| 20 | Plugin CLI & Scaffolding | [20-plugin-cli.md](./20-plugin-cli.md) | High | L |
| 21 | Plugin Upgrade Hooks | [21-plugin-upgrades.md](./21-plugin-upgrades.md) | Medium | M |

### v1.0 — Production-Ready (Phase E)
> "Open-source Jira alternative, ready for the world"

| # | Feature | File | Priority | Effort |
|---|---------|------|----------|--------|
| 22 | OAuth SSO | [22-oauth-sso.md](./22-oauth-sso.md) | Critical | L |
| 23 | Jira Import | [23-jira-import.md](./23-jira-import.md) | High | L |
| 24 | Docs & Wiki | [24-docs-wiki.md](./24-docs-wiki.md) | Medium | XL |
| 25 | Forms (External Intake) | [25-forms.md](./25-forms.md) | Medium | L |
| 26 | API Key Management | [26-api-keys.md](./26-api-keys.md) | High | M |
| 27 | Recurring Tasks | [27-recurring-tasks.md](./27-recurring-tasks.md) | Medium | M |
| 28 | Audit Log | [28-audit-log.md](./28-audit-log.md) | High | M |

### v1.1 - Personal Intelligence (Phase F)

> "Weaver helps reconstruct the work without becoming surveillance"

| # | Feature | File | Priority | Effort |
|---|---------|------|----------|--------|
| 29 | Automatic Time Plugin | [29-automatic-time-plugin.md](./29-automatic-time-plugin.md) | High | XL |

---

## Effort Key

| Size | Meaning |
|------|---------|
| S | 1-2 days, few files |
| M | 3-5 days, ~10 files |
| L | 1-2 weeks, cross-cutting |
| XL | 2-4 weeks, new subsystem |

## How to Work With This

1. Pick a feature file (e.g., `01-drag-and-drop.md`)
2. Read the task list — each task is a self-contained unit of work
3. Tasks are ordered by dependency (do them top-to-bottom)
4. Each task has acceptance criteria and required tests
5. Mark tasks done as you go (`[x]`)
6. Run the listed test commands to verify

## Architecture Principles

- **No over-engineering** — build what's needed, not what might be needed
- **Plugin-first** — if a feature can be a plugin, make it a plugin
- **Test the boundaries** — e2e tests for HTTP->Guard->DB->Response chain
- **Tenant isolation always** — every feature must work in multi-tenant context
- **Progressive enhancement** — features degrade gracefully when plugins are disabled
