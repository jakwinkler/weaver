# Weaver Plugin API Reference

Server entrypoints and route handlers import their contracts from `@weaver/sdk`:

```typescript
import type { PluginContext, PluginRequest, PluginResponse, WeaverPlugin } from '@weaver/sdk';
```

## Plugin lifecycle

A server module may export these functions:

```typescript
onInstall?(context: PluginContext): Promise<void>;
onEnable?(context: PluginContext): Promise<void>;
onDisable?(context: PluginContext): Promise<void>;
onUninstall?(context: PluginContext): Promise<void>;
onUpgrade?(fromVersion: string, toVersion: string, context: PluginContext): Promise<void>;
onEvent?(event: string, data: unknown, context: PluginContext): Promise<void>;
```

| Hook          | Invocation                | Expected responsibility                        |
| ------------- | ------------------------- | ---------------------------------------------- |
| `onInstall`   | First tenant installation | Create plugin-owned schema and initial data    |
| `onEnable`    | `POST /plugins/enable`    | Resume active behavior without recreating data |
| `onDisable`   | Plugin deactivation       | Stop active behavior and preserve data         |
| `onUninstall` | Tenant removal            | Clean up documented plugin-owned resources     |
| `onUpgrade`   | `POST /plugins/upgrade`   | Move data forward after versioned migrations   |
| `onEvent`     | A subscribed tenant event | React to the event payload                     |

Install does not call `onEnable`, even when the plugin installs enabled. Throwing rejects the lifecycle operation. Log useful context without including secrets.

## `PluginContext`

```typescript
interface PluginContext {
  db: PluginDbAccess;
  http: PluginHttpClient;
  events: PluginEventEmitter;
  settings: Record<string, unknown>;
  api: PluginCoreApi;
  logger: PluginLogger;
  tenant: { id: string; slug: string; schemaName: string };
  user?: { id: string; email: string; displayName: string };
}
```

The context is scoped to the current tenant. A route invocation normally includes `user`. Lifecycle hooks and background event delivery may not.

### `context.db`

```typescript
interface PluginDbAccess {
  query(sql: string, params?: unknown[]): Promise<unknown[]>;
  runMigration(sql: string): Promise<void>;
}
```

`query` executes parameterized SQL in the tenant context:

```typescript
const rows = await context.db.query(
  'SELECT * FROM release_notes WHERE project_id = $1 ORDER BY created_at DESC',
  [projectId],
);
```

`runMigration` executes DDL:

```typescript
await context.db.runMigration(`
  CREATE TABLE IF NOT EXISTS release_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL
  )
`);
```

Use parameters for values. Do not interpolate user input into SQL.

`query` returns the driver's raw result. For a top-level `UPDATE` or `DELETE`, that is `[rows, rowCount]`, not the rows, so `result.length` is always 2. When you need the `RETURNING` rows, run the statement in a CTE and select them:

```typescript
const claimed = await context.db.query(
  `WITH claimed AS (
     UPDATE drafts SET state = 'publishing' WHERE id = $1 AND state = 'ready' RETURNING id
   ) SELECT id FROM claimed`,
  [draftId],
);
if (!claimed.length) return { status: 409, body: { message: 'Already publishing' } };
```

### `context.http`

```typescript
interface PluginHttpClient {
  get(url: string, options?: RequestOptions): Promise<HttpResponse>;
  post(url: string, body?: unknown, options?: RequestOptions): Promise<HttpResponse>;
  put(url: string, body?: unknown, options?: RequestOptions): Promise<HttpResponse>;
  patch(url: string, body?: unknown, options?: RequestOptions): Promise<HttpResponse>;
  delete(url: string, options?: RequestOptions): Promise<HttpResponse>;
}

interface RequestOptions {
  headers?: Record<string, string>;
  timeout?: number;
  responseType?: 'json' | 'text';
}

interface HttpResponse {
  status: number;
  data: unknown;
  headers: Record<string, string>;
}
```

Example:

```typescript
const response = await context.http.post(
  'https://example.test/releases',
  { project: 'WEB', version: '2.4.0' },
  { headers: { Authorization: `Bearer ${token}` }, timeout: 10_000 },
);
```

Request bodies are sent as JSON with `Content-Type: application/json`. The timeout defaults to 30 seconds and covers reading the body. Redirects are followed only to addresses that pass the same outbound checks as the original URL, and a response body larger than 1 MB is rejected.

`responseType` controls `data`:

| `responseType`   | `data`                                                                   |
| ---------------- | ------------------------------------------------------------------------ |
| `json` (default) | The parsed JSON body, or `null` when the body is empty or not valid JSON |
| `text`           | The body as a string, `''` when empty                                    |

Use `text` for a server that does not answer JSON, such as a Model Context Protocol server that replies with `text/event-stream`:

```typescript
const response = await context.http.post(
  'https://mcp.example.test/mcp',
  { jsonrpc: '2.0', id: 1, method: 'tools/list' },
  {
    headers: { Accept: 'application/json, text/event-stream', Authorization: `Bearer ${token}` },
    responseType: 'text',
  },
);
const dataLines = String(response.data)
  .split('\n')
  .filter((line) => line.startsWith('data:'))
  .map((line) => line.slice('data:'.length).trim());
```

Treat the response data as untrusted input. Obtain credentials from supported tenant configuration or secret storage, not source literals.

### `context.events`

```typescript
interface PluginEventEmitter {
  emit(event: string, data: unknown): Promise<void>;
}
```

```typescript
await context.events.emit('release-notes.published', {
  projectKey,
  version,
});
```

Namespace plugin events and list them under `events.emits` in the manifest.

### `context.settings`

```typescript
settings: Record<string, unknown>;
```

Values are tenant-specific. Narrow them before use:

```typescript
const maximumItems =
  typeof context.settings.maximumItems === 'number' ? context.settings.maximumItems : 50;
```

Declare the corresponding types and defaults in `settings.schema`.

### `context.api.issues`

```typescript
issues: {
  assertAccess(key: string, mode: 'read' | 'write'): Promise<void>;
  get(key: string): Promise<unknown>;
  findCandidates(filters?: PluginIssueCandidateFilters): Promise<PluginIssueCandidate[]>;
  create(
    projectKey: string,
    input: PluginIssueCreateInput,
    options?: { reporterId?: string },
  ): Promise<PluginCreatedIssue>;
  update(key: string, data: Record<string, unknown>): Promise<unknown>;
  addComment(
    key: string,
    body: string | PluginRichTextDocument,
    options?: { authorId?: string },
  ): Promise<PluginComment | null>;
};
```

```typescript
const issue = await context.api.issues.get('WEB-42');
await context.api.issues.update('WEB-42', { priority: 'high' });
await context.api.issues.addComment('WEB-42', 'Included in release 2.4.0');
```

`findCandidates` requires the `issue-candidates` core capability and a request user. `update` accepts only these fields: `summary`, `description`, `priority`, `assignee_id`, `custom_fields`, `sprint_id`, `parent_id`, `epic_id`, `labels`, `sort_order`, `start_date`, `due_date`, and `percent_done`.

#### Acting user

`create` and `addComment` act as a person, not as the plugin:

- On a route with a request user, they act as that user unless an explicit actor is passed.
- On a public route, in `onEvent`, or in a lifecycle hook there is no request user, so pass `reporterId` or `authorId`. Without one the call throws a forbidden error.
- The actor must be a member of the tenant with the role permission the matching HTTP route requires (`issues.create`, plus `issues.assign` when an assignee is set; `comments.create` for comments) and write access to the project. Otherwise the call throws a forbidden error and writes nothing.

Choosing the actor is the plugin's responsibility. Map an external identity to a Weaver user deliberately, for example through a setting an administrator controls, and fall back to a designated user rather than guessing.

#### `create`

Requires the `issue-create` core capability.

```typescript
interface PluginIssueCreateInput {
  summary: string;
  description?: PluginRichTextDocument;
  priority?: 'lowest' | 'low' | 'medium' | 'high' | 'highest';
  issueTypeId?: string;
  assigneeId?: string;
  labels?: string[];
  parentId?: string;
  epicId?: string;
  customFields?: Record<string, unknown>;
  startDate?: string; // YYYY-MM-DD
  dueDate?: string; // YYYY-MM-DD
  percentDone?: number;
  storyPoints?: number | null;
}

interface PluginCreatedIssue {
  id: string;
  key: string;
  projectKey: string;
  summary: string;
  statusId: string;
  reporterId: string;
  assigneeId: string | null;
  createdAt: string;
}
```

```typescript
const issue = await context.api.issues.create(
  'WEB',
  {
    summary: 'Checkout button does nothing',
    description: {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Reported from the help desk' }] },
      ],
    },
    priority: 'high',
    labels: ['support'],
  },
  { reporterId: mappedUserId },
);
```

The input is validated like the body of `POST /projects/:projectKey/issues`, except that unknown fields, including a misplaced `reporterId`, are rejected with a bad request error and recurrence rules are not accepted. The issue is created by the same service as that route, so it starts in the initial status of the project's workflow, custom fields are validated, the assignee is notified, and `issue.created` is sent to webhooks, plugins, and connected browsers after the issue is saved. The plugin path also records a `created` activity entry for the reporter. The issue number, issue, and activity entry are written in one transaction.

#### `addComment`

A string body becomes one paragraph. To mention someone, pass a rich-text document with a mention node:

```typescript
await context.api.issues.addComment(
  'WEB-42',
  {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'mention', attrs: { id: requesterId, label: 'Riley' } },
          { type: 'text', text: ' a recording arrived for this issue.' },
        ],
      },
    ],
  },
  { authorId: integrationUserId },
);
```

The comment is written by the same service as `POST /issues/:issueKey/comments`, so the document is validated, mentioned project members are notified, the reporter and assignee get comment email by their preferences, and `comment.created` is sent. `addComment` resolves to `null` when the issue does not exist.

```typescript
interface PluginComment {
  id: string;
  issueId: string;
  authorId: string;
  body: PluginRichTextDocument;
  createdAt: string;
}
```

### `context.api.projects`

```typescript
projects: {
  /** null means a tenant administrator; [] means no visible projects. */
  accessibleIds(): Promise<string[] | null>;
  assertAccess(key: string, mode: 'read' | 'write'): Promise<void>;
  get(key: string): Promise<unknown>;
  list(): Promise<unknown[]>;
};
```

```typescript
const project = await context.api.projects.get('WEB');
const projects = await context.api.projects.list();
```

`get` and `list` read rows without an access check. Use `assertAccess` when a request body or query names a project, because the host checks only `:projectKey` and `:issueKey` route parameters. It throws unless the request user can read (or write) the project, and it requires a request user:

```typescript
await context.api.projects.assertAccess(body.projectKey, 'write');
```

### `context.api.users`

```typescript
users: {
  get(id: string): Promise<unknown>;
  list(): Promise<unknown[]>;
  findMemberByEmail(email: string): Promise<PluginTenantMember | null>;
};

interface PluginTenantMember {
  id: string;
  email: string;
  displayName: string;
}
```

`get` currently returns `null` and `list` returns `[]`; neither is wired to user data yet.

`findMemberByEmail` maps an external identity, such as a bug reporter's email, to a member of the current tenant. It matches case-insensitively and returns `null` for anyone outside the tenant. It confers no access by itself: `issues.create` still checks the reporter it is given.

```typescript
const member = await context.api.users.findMemberByEmail(reporterEmail);
const issue = await context.api.issues.create(
  'WEB',
  input,
  member ? { reporterId: member.id } : {},
);
```

Check `context.user` before using it because background invocations may not have an actor.

### `context.api.customFields`

```typescript
customFields: {
  register(definition: {
    name: string;
    slug: string;
    fieldType: string;
    entityType: string;
    options?: Record<string, unknown>;
    required?: boolean;
  }): Promise<unknown>;
  unregisterAll(): Promise<void>;
};
```

```typescript
await context.api.customFields.register({
  name: 'Release channel',
  slug: 'release_channel',
  fieldType: 'select',
  entityType: 'issue',
  options: { choices: ['alpha', 'beta', 'stable'] },
});
```

`unregisterAll` removes fields registered by the current plugin. Use it only when the plugin's uninstall contract says those fields should be removed.

### `context.api.activityLog`

```typescript
activityLog: {
  create(
    issueKey: string,
    dto: {
      action: string;
      fieldName?: string | null;
      oldValue?: string | null;
      newValue?: string | null;
    },
  ): Promise<unknown>;
};
```

```typescript
await context.api.activityLog.create('WEB-42', {
  action: 'release_note_added',
  fieldName: 'release',
  oldValue: null,
  newValue: '2.4.0',
});
```

### `context.logger`

```typescript
interface PluginLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}
```

```typescript
context.logger.info('Published release notes', { projectKey, version });
```

The logger is scoped to the plugin. Never log tokens, credentials, or sensitive request bodies.

### `context.tenant`

```typescript
tenant: {
  id: string;
  slug: string;
  schemaName: string;
}
```

`slug` is currently always an empty string. Use `id` to identify the tenant.

Database queries default to the current tenant search path. Plugins are trusted server code with a shared database principal, not a security sandbox; fully qualified SQL can access other schemas. Use `context.api.projects.accessibleIds()` and `context.api.issues.assertAccess(key, mode)` to enforce the current user’s project permissions. The tenant fields are useful for logging, external correlation, and tenant-aware URLs.

### `context.user`

```typescript
user?: {
  id: string;
  email: string;
  displayName: string;
};
```

The user is present for authenticated plugin routes and optional elsewhere. Permission enforcement happens before a protected route handler is called, but handlers should still validate authorization for any resource-level rule they own.

## `PluginRequest`

```typescript
interface PluginRequest {
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  headers: Record<string, string>;
}
```

| Field     | Source                                            |
| --------- | ------------------------------------------------- |
| `params`  | Named manifest route segments such as `:issueKey` |
| `query`   | URL query parameters                              |
| `body`    | Parsed request body                               |
| `headers` | Incoming request headers                          |

Validate `body`, query values, and headers before use:

```typescript
interface PublishBody {
  version: string;
}

function isPublishBody(value: unknown): value is PublishBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).version === 'string'
  );
}

export async function publish(
  request: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  if (!isPublishBody(request.body)) {
    return { status: 400, body: { message: 'version is required' } };
  }
  context.logger.info('Publishing', { version: request.body.version });
  return { status: 201, body: { published: true } };
}
```

## `PluginResponse`

```typescript
interface PluginResponse {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}
```

Examples:

```typescript
return { status: 200, body: { items } };

return {
  status: 201,
  headers: { Location: `/releases/${releaseId}` },
  body: { id: releaseId },
};

return { status: 404, body: { message: 'Release not found' } };
```

Weaver applies response headers, sets the status, and serializes the body as JSON.

## Optional registration interfaces

The SDK also defines an object-style `WeaverPlugin` contract with registration methods:

```typescript
interface WeaverPlugin {
  manifest: PluginManifest;
  onInstall?(context: PluginContext): Promise<void>;
  onEnable?(context: PluginContext): Promise<void>;
  onDisable?(context: PluginContext): Promise<void>;
  onUninstall?(context: PluginContext): Promise<void>;
  onEvent?(event: string, data: unknown, context: PluginContext): Promise<void>;
  registerRoutes?(router: PluginRouter): void;
  registerWorkflowConditions?(registry: ConditionRegistry): void;
  registerWorkflowPostFunctions?(registry: PostFunctionRegistry): void;
}
```

### `PluginRouter`

```typescript
interface PluginRouter {
  get(path: string, handler: RouteHandler): void;
  post(path: string, handler: RouteHandler): void;
  put(path: string, handler: RouteHandler): void;
  patch(path: string, handler: RouteHandler): void;
  delete(path: string, handler: RouteHandler): void;
}

type RouteHandler = (request: PluginRequest, context: PluginContext) => Promise<PluginResponse>;
```

The current manifest loader resolves `routes` from `weaver-plugin.json`. Prefer manifest route declarations unless a host integration explicitly supplies the registration interface.

### Workflow conditions

```typescript
interface ConditionRegistry {
  register(name: string, evaluator: ConditionEvaluator): void;
}

type ConditionEvaluator = (
  params: Record<string, unknown>,
  context: PluginContext,
) => Promise<boolean>;
```

### Workflow post-functions

```typescript
interface PostFunctionRegistry {
  register(name: string, fn: PostFunction): void;
}

type PostFunction = (params: Record<string, unknown>, context: PluginContext) => Promise<void>;
```

These interfaces are SDK extension contracts. Availability depends on the host workflow runtime that loads the plugin.

## Related references

- [Plugin development guide](./plugin-development.md)
- [Plugin manifest reference](./plugin-manifest-reference.md)
