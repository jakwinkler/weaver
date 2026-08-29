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
onEvent?(event: string, data: unknown, context: PluginContext): Promise<void>;
```

| Hook          | Invocation                | Expected responsibility                        |
| ------------- | ------------------------- | ---------------------------------------------- |
| `onInstall`   | First tenant installation | Create plugin-owned schema and initial data    |
| `onEnable`    | Plugin activation         | Resume active behavior without recreating data |
| `onDisable`   | Plugin deactivation       | Stop active behavior and preserve data         |
| `onUninstall` | Tenant removal            | Clean up documented plugin-owned resources     |
| `onEvent`     | A subscribed tenant event | React to the event payload                     |

Throwing rejects the lifecycle operation. Log useful context without including secrets.

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
  get(key: string): Promise<unknown>;
  update(key: string, data: Record<string, unknown>): Promise<unknown>;
  addComment(key: string, body: string): Promise<unknown>;
};
```

```typescript
const issue = await context.api.issues.get('WEB-42');
await context.api.issues.update('WEB-42', { status: 'done' });
await context.api.issues.addComment('WEB-42', 'Included in release 2.4.0');
```

### `context.api.projects`

```typescript
projects: {
  get(key: string): Promise<unknown>;
  list(): Promise<unknown[]>;
};
```

```typescript
const project = await context.api.projects.get('WEB');
const projects = await context.api.projects.list();
```

### `context.api.users`

```typescript
users: {
  get(id: string): Promise<unknown>;
  list(): Promise<unknown[]>;
};
```

```typescript
const actor = await context.api.users.get(context.user!.id);
const users = await context.api.users.list();
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

Database access is already tenant-scoped. The tenant fields are useful for logging, external correlation, and tenant-aware URLs.

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
