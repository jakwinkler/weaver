# Weaver - Open Source Project Management Platform

> Historical design proposal. This document is not the current feature, pricing, or licensing contract. See [LICENSE](LICENSE) for the project license and [README](README.md) for current entry points.

## Context

Build "Weaver" - an open-source JIRA alternative for task/issue management, with a plugin architecture and visual workflow designer. The open-source core will be released under MIT/Apache 2.0, with a future paid tier adding enterprise features (SAML SSO, advanced reporting, audit logs, SLA management, portfolio management).

## Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| Backend | NestJS + TypeScript | Modular DI, full-stack type sharing, great plugin pattern |
| Frontend | React + TypeScript | Largest ecosystem, best for complex UIs (boards, workflow editor) |
| Database | PostgreSQL 16 | JSONB for custom fields, GIN indexes, schema-per-tenant |
| Real-time | Socket.io (WebSockets) | Bidirectional, room-based, excellent NestJS integration |
| Queue | BullMQ + Redis | Async jobs: webhooks, notifications, SCM sync |
| ORM | TypeORM | Better schema-per-tenant support than Prisma |
| Monorepo | Turborepo + pnpm | Incremental builds, remote caching, workspace management |
| CSS | Tailwind CSS | Rapid UI development, design system tokens |
| Testing | Jest (BE) + Vitest (FE) + Playwright (E2E) | Modern, fast test tooling |

## Monorepo Structure

```
weaver/
├── turbo.json
├── pnpm-workspace.yaml
├── docker/
│   ├── docker-compose.yml          # Dev/small team deployment
│   ├── docker-compose.dev.yml
│   ├── Dockerfile.api
│   ├── Dockerfile.web
│   └── Dockerfile.worker
├── k8s/
│   ├── base/                       # Kustomize base manifests
│   └── overlays/                   # dev / production overlays
├── apps/
│   ├── api/                        # NestJS backend
│   ├── web/                        # React SPA (Vite)
│   └── worker/                     # BullMQ worker process
├── packages/
│   ├── shared/                     # Types, DTOs (zod), constants, WQL parser
│   ├── sdk/                        # Plugin SDK (@weaver/sdk)
│   ├── ui/                         # Shared React component library
│   ├── db/                         # TypeORM entities, migrations
│   └── config/                     # Shared ESLint, TSConfig
└── plugins/                        # Official plugins
    ├── plugin-github/
    ├── plugin-gitlab/
    ├── plugin-bitbucket/
    └── plugin-slack/
```

## Multi-Tenancy: Schema-Per-Tenant

- **Public schema**: `tenants`, `users`, `tenant_memberships`, `api_keys`, `installed_plugins`
- **Per-tenant schema** (e.g., `tenant_acme`): all project data - `projects`, `issues`, `workflows`, `boards`, `sprints`, `comments`, `webhooks`, `notifications`, etc.
- Tenant resolved via: subdomain > JWT claim > `X-Tenant-ID` header
- `AsyncLocalStorage` propagates tenant context through the request lifecycle
- NestJS durable request-scoped providers reuse connections per tenant

## Core Database Tables

### Public Schema

- `tenants` (id, name, slug, schema_name, plan, settings)
- `users` (id, email, display_name, password_hash, auth_provider)
- `tenant_memberships` (tenant_id, user_id, role)
- `api_keys` (tenant_id, user_id, key_hash, scopes, expires_at)
- `installed_plugins` (tenant_id, plugin_id, version, settings)

### Tenant Schema (per org)

- `projects` (id, key, name, workflow_id, lead_user_id)
- `issues` (id, project_id, key, summary, description[JSONB], status_id, priority, assignee_id, custom_fields[JSONB], sprint_id, parent_id, epic_id, labels[], sort_order)
- `issue_types` (id, name, slug, is_subtask)
- `issue_links` (link_type, source_issue_id, target_issue_id)
- `workflows` (id, name, is_default)
- `workflow_statuses` (id, workflow_id, name, category[todo/in_progress/done], color, is_initial, is_terminal)
- `workflow_transitions` (id, from_status_id, to_status_id, conditions[JSONB], validators[JSONB], post_functions[JSONB])
- `custom_field_definitions` (id, name, slug, field_type, options[JSONB], validation[JSONB])
- `boards` (id, project_id, name, type[kanban/scrum], config[JSONB])
- `sprints` (id, project_id, name, start_date, end_date, status)
- `comments` (id, issue_id, author_id, body[JSONB/TipTap])
- `attachments` (id, issue_id, filename, storage_key)
- `activity_log` (id, issue_id, user_id, action, field_name, old_value, new_value)
- `roles` (id, name, permissions[JSONB])
- `teams` / `team_members` / `project_members`
- `webhooks` (id, project_id, url, secret, events[])
- `webhook_deliveries` (webhook_id, payload, response_status, retry_count)
- `notifications` (id, user_id, type, title, data[JSONB], is_read)
- `saved_filters` (id, name, owner_id, query[WQL string])
- `time_entries` (id, issue_id, user_id, minutes, description)

Custom fields stored as JSONB on `issues.custom_fields` with GIN index. Validated at app layer against `custom_field_definitions`.

## Backend Architecture (NestJS)

### Module Organization

```
apps/api/src/
├── core/
│   ├── database/          # Tenant connection provider, migration service
│   ├── auth/              # JWT, API key, OAuth strategies + guards
│   ├── tenant/            # Middleware, AsyncLocalStorage context, provisioning
│   ├── events/            # EventBus (EventEmitter2 + BullMQ bridge)
│   ├── queue/             # BullMQ configuration
│   ├── cache/             # Redis-backed caching
│   ├── storage/           # File storage (local + S3 adapters)
│   ├── websocket/         # Socket.io gateway
│   └── rate-limiting/     # Redis-backed throttling
├── modules/
│   ├── projects/          # CRUD, members
│   ├── issues/            # CRUD, key generation (WEB-1234)
│   ├── workflows/         # Engine, condition evaluators, post-functions
│   ├── custom-fields/     # Definitions, validation
│   ├── boards/            # Kanban/Scrum config
│   ├── sprints/           # Sprint lifecycle
│   ├── comments/          # Rich text comments
│   ├── attachments/       # File upload/download
│   ├── search/            # WQL parser + SQL translator
│   ├── notifications/     # In-app + email channels
│   ├── webhooks/          # CRUD + delivery with HMAC
│   ├── teams/             # Team management
│   ├── roles/             # RBAC with custom roles
│   ├── activity-log/      # Event-driven changelog
│   └── time-tracking/     # Time entries
└── plugins/
    ├── plugin-loader.service.ts
    ├── plugin-registry.service.ts
    └── plugin-sandbox.service.ts
```

### Key Architectural Patterns

**Workflow Engine** - Strategy/registry pattern:
- `ConditionEvaluatorRegistry` - pluggable condition checks (user_in_role, field_required, sub_tasks_resolved)
- `PostFunctionRegistry` - pluggable side effects (set_field, send_notification, webhook)
- Plugins can register their own conditions and post-functions

**Event System** - Dual-layer:
- Synchronous: `@nestjs/event-emitter` for in-process listeners (activity log, cache invalidation)
- Asynchronous: BullMQ queues for heavy processing (webhooks, notifications, SCM sync, plugin handlers)
- Domain events: `IssueCreatedEvent`, `StatusChangedEvent`, `CommentAddedEvent`, etc.

**Queue System** (BullMQ):

| Queue | Purpose | Concurrency |
|---|---|---|
| events | Async event dispatch | 10 |
| webhooks | HTTP delivery with retries | 5 |
| notifications | Email + push | 10 |
| scm-sync | SCM polling/sync | 3 |
| tenant-ops | Schema creation/migration | 1 |

## Frontend Architecture (React)

```
apps/web/src/
├── api/                   # Axios client + React Query hooks
├── stores/                # Zustand (auth, tenant, UI state only)
├── features/
│   ├── auth/              # Login, register, SSO
│   ├── projects/          # List, settings
│   ├── issues/            # Detail, create, custom field renderer
│   ├── boards/            # Kanban (dnd-kit), Scrum, List, Calendar, Gantt
│   ├── workflows/         # Visual editor (React Flow / @xyflow/react)
│   ├── search/            # WQL input with autocomplete, saved filters
│   ├── notifications/     # Panel, preferences
│   └── settings/          # Org, roles, custom fields, webhooks, plugins
├── plugins/               # UI slot system for plugin components
├── realtime/              # Socket.io client, subscription hooks
└── layouts/               # App shell, sidebar, topbar
```

### Key Libraries

- **@dnd-kit** - Board drag-and-drop (actively maintained, replaces deprecated react-beautiful-dnd)
- **@xyflow/react** (React Flow) - Workflow visual editor with custom nodes/edges
- **TipTap** (ProseMirror) - Rich text editor for descriptions/comments (JSON output for JSONB storage)
- **Zustand** - Client UI state only
- **TanStack Query (React Query)** - All server state management
- **Tailwind CSS** - Styling

## Plugin System

### Plugin Manifest (`weaver-plugin.json`)

```json
{
  "id": "@weaver/plugin-github",
  "name": "GitHub Integration",
  "version": "1.0.0",
  "entrypoints": { "server": "./dist/server/index.js", "client": "./dist/client/index.js" },
  "permissions": ["issues:read", "issues:write", "webhooks:manage"],
  "settings": { "schema": { "githubAppId": { "type": "string", "required": true } } },
  "events": { "subscribes": ["issue.created", "issue.status_changed"], "emits": ["github.pr_merged"] },
  "ui": { "slots": [{ "slot": "issue-detail-panel", "component": "GithubPanel" }] },
  "routes": [{ "method": "POST", "path": "/github/webhook", "handler": "handleWebhook" }],
  "migrations": ["./migrations/001_create_github_links.sql"]
}
```

### Plugin SDK (`@weaver/sdk`) - `WeaverPlugin` interface:

- Lifecycle: `onInstall()`, `onEnable()`, `onDisable()`, `onUninstall()`
- `onEvent(event, context)` - React to domain events
- `registerRoutes(router)` - Add API endpoints under `/api/v1/plugins/{pluginId}/*`
- `registerWorkflowConditions(registry)` - Add custom workflow conditions
- `registerWorkflowPostFunctions(registry)` - Add custom post-functions
- `registerCustomFieldTypes(registry)` - Add custom field types

### PluginContext provides:

- `db` - Tenant-scoped database access (raw SQL + migrations)
- `http` - HTTP client for external APIs
- `events` - Emit domain events
- `settings` - Plugin config for current tenant
- `api` - Access to core Weaver APIs (issues, projects, users, comments, notifications)
- `storage` - Plugin data storage
- `logger` - Scoped logger

## API Design (REST)

All under `/api/v1/`. Tenant resolved from JWT/header.

- **Auth**: login, register, refresh, SSO flow
- **Projects**: CRUD, members (`/projects/:projectKey`)
- **Issues**: CRUD, transitions, comments, activity, attachments, links, time entries (`/issues/:issueKey`)
- **Boards**: list, get with issues, reorder (`/boards/:boardId`)
- **Sprints**: CRUD, start, complete, add issues (`/sprints/:sprintId`)
- **Workflows**: CRUD with statuses/transitions (`/workflows/:workflowId`)
- **Custom Fields**: definitions CRUD (`/custom-fields`)
- **Search**: WQL query endpoint (`POST /search`)
- **Webhooks**: CRUD + delivery log (`/webhooks`)
- **Notifications**: list, mark-read, preferences (`/notifications`)
- **Plugins**: install, enable, disable, settings (`/plugins/:pluginId`)
- **Plugin routes**: `* /plugins/:pluginId/*` proxied to plugin handlers

**Auth**: JWT (15min) + refresh token (7d, httpOnly cookie). API keys with `wvr_` prefix.
**Rate limiting**: 1000 req/min (auth), 600 req/min (API key), 30 req/min (unauth).
**Pagination**: `?page=1&perPage=50&sort=-updatedAt` with `{data, meta: {page, perPage, total, totalPages}}`.
**Webhooks**: HMAC-SHA256 signed, 3 retries with exponential backoff, circuit breaker after 10 failures.

## Deployment

### Docker Compose (dev / small teams)

Services: `api`, `worker`, `web` (nginx), `postgres:16`, `redis:7`
Single `docker compose up` to run everything.

### Kubernetes (enterprise)

Kustomize-based with overlays. HPA on api (2-10 pods) and worker. Ingress with WebSocket sticky sessions. Managed DB/Redis recommended for production.

### Tenant Migration Strategy

- Shared schema migrations run at API startup (standard TypeORM)
- Tenant migrations tracked per-schema in `tenant_migration_history`
- On startup: iterate all tenants, apply pending migrations
- New tenants: all migrations run during provisioning + seed defaults (workflow, issue types, roles)

## Development Roadmap

### Phase 1: Foundation (Weeks 1-6)

Monorepo setup, Docker dev environment, NestJS skeleton, public schema, tenant middleware + provisioning, auth (local + JWT), user management, projects CRUD, basic issues CRUD, React app skeleton (router, layout, auth, project/issue pages), shared packages, CI pipeline.

**Deliverable**: Sign up, create org, create projects, create/edit issues.

### Phase 2: Workflows & Boards (Weeks 7-12)

Workflow module (statuses, transitions, conditions, post-functions), workflow engine, issue types, issue linking, boards (Kanban + Scrum), sprints, visual workflow editor (React Flow), board drag-and-drop (dnd-kit), list view, comments (TipTap), activity log.

**Deliverable**: Custom workflows, visual editor, Kanban/Scrum boards.

### Phase 3: Custom Fields & Search (Weeks 13-17)

Custom field definitions, JSONB validation, dynamic form rendering, WQL parser (PEG.js), WQL-to-SQL translator, search endpoint, saved filters, quick filters on boards, WQL autocomplete, attachments, calendar view, time tracking.

**Deliverable**: Extensible data model, powerful query language.

### Phase 4: Plugin System & SCM (Weeks 18-24)

Plugin manifest, loader, SDK package, route/event registration, plugin DB access, UI slot system, plugin management page, GitHub/GitLab/Bitbucket plugins (webhook receiver, commit/PR linking, branch creation, status sync), developer docs.

**Deliverable**: Working plugin system with 3 SCM integrations.

### Phase 5: Real-Time & Notifications (Weeks 25-30)

WebSocket gateway with tenant rooms, real-time board/issue updates, in-app notifications, email notifications (React Email), notification preferences, webhook module (CRUD, HMAC, retries, delivery log), rate limiting, OpenAPI docs, RBAC with custom roles, teams.

**Deliverable**: Live collaboration, notifications, production-ready API.

### Phase 6: Polish & Launch (Weeks 31-36)

SSO/SAML/OIDC (paid), Google OAuth (free), Gantt view, keyboard shortcuts, bulk ops, import/export (CSV, JSON, JIRA), onboarding flow, performance optimization, security audit, K8s manifests + Helm chart, Playwright E2E tests, documentation site, landing page, license decision, launch.

**Deliverable**: Production-ready open-source release.

## Verification

After each phase:

1. Run full test suite: `pnpm turbo test`
2. Run E2E tests: `pnpm turbo test:e2e`
3. Docker Compose smoke test: `docker compose up` and verify all services healthy
4. Manual QA: create tenant, create project, full issue lifecycle through workflow
5. API testing via Swagger UI at `/api/docs`
6. Performance: ensure <200ms p95 for issue CRUD, <500ms for board load with 200+ issues
