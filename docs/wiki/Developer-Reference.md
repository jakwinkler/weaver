# Developer and LLM reference

Start here when you need the code location, request contract, or verification boundary behind a user-facing feature. For everyday instructions, use [Home](https://github.com/jakwinkler/weaver/wiki/Home). This page is intentionally technical.

The original feature-guide baseline is main `1b1b370`, checked September 23, 2026. Client access, issue workflow, and deployment-path updates were checked against pilot release `ce5494a` on October 15, 2026. Follow each guide's immutable source links when exact behavior matters. Roadmap checkboxes and older examples can lag behind the implementation.

## Request conventions

The default API prefix is `/api/v1`. Browser sessions use HTTP-only authentication cookies and an authenticated tenant context. API clients can use supported bearer tokens or [API keys](https://github.com/jakwinkler/weaver/wiki/API-Keys-and-Integrations). A tenant header does not grant membership; the server validates it against the authenticated identity.

Organization data is separated by tenant schema. Request-scoped context selects that schema. Plugins, background jobs, search, files, and public routes must preserve the same boundary.

Paginated endpoints conventionally return:

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "perPage": 25,
    "total": 0,
    "totalPages": 0
  }
}
```

Use `page`, `perPage`, and `sort` query parameters where supported. Prefix a sort field with `-` for descending order, for example `sort=-createdAt`. Sort fields are allowlisted per endpoint. Do not assume every endpoint is paginated: lookups, plugin lists, and other specialized routes can return arrays or their own shapes.

## API map

Routes below are relative to `/api/v1`. This is an orientation map, not an exhaustive generated API specification. Controllers and shared schemas are the contract for payloads and permissions.

| Area | Main routes | Guide |
| --- | --- | --- |
| Identity | `/auth/register`, `/auth/login`, `/auth/me`, `/auth/refresh`, `/auth/logout`, `/auth/invitations/:token`, `/auth/organizations`, `/auth/switch-organization`, `/auth/providers` | [Getting Started](https://github.com/jakwinkler/weaver/wiki/Getting-Started), [OAuth Sign In](https://github.com/jakwinkler/weaver/wiki/OAuth-Sign-In) |
| Password reset | `/auth/password-reset/request` (always 202), `/auth/password-reset/confirm` | [Getting Started](https://github.com/jakwinkler/weaver/wiki/Getting-Started) |
| Projects | `/projects`, `/projects/:key`, `/projects/:key/workflow`, member/type/plugin subroutes | [Projects and Access](https://github.com/jakwinkler/weaver/wiki/Projects-and-Access) |
| Invitations | `/users/invitations` (administrator creation) | [Projects and Access](https://github.com/jakwinkler/weaver/wiki/Projects-and-Access) |
| Issues | `/projects/:projectKey/issues`, `/issues/:issueKey`, `/issues/bulk`, `/issues/reorder` | [Working with Issues](https://github.com/jakwinkler/weaver/wiki/Working-with-Issues) |
| Planning | `/projects/:projectKey/backlog`, `/projects/:projectKey/epics` | [Roadmaps and Epics](https://github.com/jakwinkler/weaver/wiki/Roadmaps-and-Epics) |
| Boards | `/boards?projectId=...`, `/boards/:id`, `/boards/:id/issues` | [Boards and Views](https://github.com/jakwinkler/weaver/wiki/Boards-and-Views) |
| Sprints | `/sprints?projectId=...`, `/sprints/:id/start`, `/sprints/:id/complete` | [Sprints and Reports](https://github.com/jakwinkler/weaver/wiki/Sprints-and-Reports) |
| Reports | `/sprints/:id/stats`, `/burndown`, `/summary`; `/projects/:projectKey/velocity` | [Sprints and Reports](https://github.com/jakwinkler/weaver/wiki/Sprints-and-Reports) |
| Pages | `/projects/:projectKey/pages` and tree/search/history/restore routes | [Project Wiki](https://github.com/jakwinkler/weaver/wiki/Project-Wiki) |
| Forms | `/projects/:projectKey/forms`, `/public/:tenantSlug/forms/:formSlug` | [Intake Forms](https://github.com/jakwinkler/weaver/wiki/Intake-Forms) |
| Rules | `/automations`, `/automations/:id/run`, `/automations/:id/executions` | [Automations](https://github.com/jakwinkler/weaver/wiki/Automations) |
| Credentials | `/api-keys` | [API Keys and Integrations](https://github.com/jakwinkler/weaver/wiki/API-Keys-and-Integrations) |
| Import | `/import/jira/projects`, `/import/jira/start`, `/import/status/:id` | [Jira Import](https://github.com/jakwinkler/weaver/wiki/Jira-Import) |
| Audit | `/audit-log`, `/audit-log/export` | [Audit Log](https://github.com/jakwinkler/weaver/wiki/Audit-Log) |
| Plugins | `/plugins`, `/plugins/available`, lifecycle/settings routes | [Plugins](https://github.com/jakwinkler/weaver/wiki/Plugins) |

## Source map

| Path | Responsibility |
| --- | --- |
| `apps/web/src/features` | User-facing pages and feature components |
| `apps/web/src/api` | Query/mutation hooks and API client |
| `apps/api/src/core/auth` | Session, OAuth/SSO, permission, and API-key checks |
| `apps/api/src/core/tenant` | Tenant context, schema provisioning, project access, and member directory visibility |
| `apps/api/src/modules` | Feature controllers and services |
| `apps/api/src/plugins` | Manifest loading, installation, routes, lifecycle |
| `apps/worker/src/processors` | Background job handlers |
| `packages/shared/src/schemas` | Shared validation and request shapes |
| `packages/db/src/entities` | Persistent entity definitions |
| `packages/sdk` | Plugin contracts and core capabilities |
| `packages/cli` | Plugin scaffolding and validation |
| `plugins` | Bundled plugin packages |
| `companion` | Native Automatic Time companion source |

## Common implementation traps

- A UI permission check is not sufficient authorization. Keep API permission and project-access guards.
- A green build does not prove module-federated screens share the correct React/router contexts.
- `storyPoints: null` and `storyPoints: 0` have different meanings.
- A date-only string parsed as a UTC timestamp and then formatted locally can shift the displayed day.
- Do not assume an update field is supported because a service type accepts it; controller validation can strip it.
- Worker environment must match the API's database, Redis, queue, and `SMTP_*` configuration.
- Account email, such as a password reset link, must use only the installation's `SMTP_*` server and the `account-mail` queue, never an organization's mail server. Never log a reset token or put it in a URL the API receives.
- `UserEntity.passwordHash` and `sessionVersion` are `update: false`. TypeORM's `save()` and `update()` leave both columns alone, so a user loaded before a password reset cannot write the old values back, and an `update()` that sets either one silently does nothing. Change them with explicit SQL, as `PasswordResetService.confirmReset` does. Inserts still set them.
- A queue's accepted response does not establish completed work.
- Roadmap proposed thresholds, npm examples, and deployment claims need verification at their actual runtime surface.

## Checks for a code change

Use focused unit/integration checks for the behavior you change, then the repository's required CI commands. CI runs lint, typecheck, tests with bounded concurrency, API integration tests, `deploy/compose/oauth-config.test.cjs`, HTTP-boundary checks, and builds.

The pilot release's [readiness record](https://github.com/jakwinkler/weaver/blob/ce5494a445f0a5412cf7e0be378308afbeb5e5f8/apps/web/e2e/READINESS-2026-10-14.md) separates disposable local checks, live client acceptance on earlier commits, and remaining verification gates. Do not infer live behavior from the source revision alone.

For UI changes, reproduce the task with synthetic data and inspect the browser. For tenant or permission changes, exercise both allowed and rejected access. For background work, verify queue completion and the resulting record, not only the enqueue response. For external providers, distinguish mock/local checks from an authenticated provider round trip.

See [Feature Coverage](https://github.com/jakwinkler/weaver/wiki/Feature-Coverage) for what this documentation walkthrough actually checked.
