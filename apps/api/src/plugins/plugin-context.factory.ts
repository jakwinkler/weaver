import { InboundWebhookService } from './inbound-webhook.service';
import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  PluginComment,
  PluginContext,
  PluginCoreCapability,
  PluginCreatedIssue,
  PluginIssueCandidate,
  PluginIssueCandidateFilters,
  PluginIssueCreateInput,
  PluginRichTextDocument,
  RequestOptions,
} from '@weaver/sdk';
import { InstalledPluginEntity, type CommentEntity, type IssueEntity } from '@weaver/db';
import { createCommentSchema, createIssueSchema } from '@weaver/shared';
import type { EntityManager, Repository } from 'typeorm';
import { z, type ZodTypeAny } from 'zod';
import { MemberVisibilityService, ProjectAccessService, TenantConnectionProvider, TenantService, requireTenantContext } from '../core/tenant';
import type { RequestUser } from '../core/auth/current-user.decorator';
import { PermissionService } from '../core/auth/permission.service';
import type { RequiredPermission } from '../core/auth/require-permission.decorator';
import { CommentsService } from '../modules/comments/comments.service';
import { EventDispatcherService } from '../modules/events';
import { IssuesService } from '../modules/issues/issues.service';
import { TimeTrackingService } from '../modules/time-tracking/time-tracking.service';
import { PluginLoaderService } from './plugin-loader.service';
import { fetchWithSafeRedirects, readLimitedResponseText } from '../core/security/outbound-http';

const ISSUE_UPDATE_FIELDS = new Set(['summary', 'description', 'priority', 'assignee_id', 'custom_fields', 'sprint_id', 'parent_id', 'epic_id', 'labels', 'sort_order', 'start_date', 'due_date', 'percent_done']);
const MAX_RESPONSE_BYTES = 1024 * 1024;
// The same fields POST /projects/:projectKey/issues accepts, minus recurrence. Strict, so a
// misplaced option such as reporterId fails loudly instead of being dropped.
const pluginIssueCreateSchema = createIssueSchema.omit({ recurrenceRule: true }).strict();
const actorIdSchema = z.string().uuid();

@Injectable()
export class PluginContextFactory {
  constructor(
    private readonly tenantConnections: TenantConnectionProvider,
    private readonly eventDispatcher: EventDispatcherService,
    private readonly loader: PluginLoaderService,
    @InjectRepository(InstalledPluginEntity)
    private readonly installedPlugins: Repository<InstalledPluginEntity>,
    private readonly timeTracking: TimeTrackingService,
    private readonly projectAccess: ProjectAccessService,
    private readonly inboundWebhooks: InboundWebhookService,
    private readonly tenants: TenantService,
    private readonly issuesService: IssuesService,
    private readonly commentsService: CommentsService,
    private readonly permissions: PermissionService,
    private readonly memberVisibility: MemberVisibilityService,
  ) {}

  async create(
    pluginId: string,
    settings: Record<string, unknown>,
    user?: { id: string; email: string; displayName: string },
    options?: {
      manager?: EntityManager;
      capabilityState?: { installed: boolean; enabled: boolean };
    },
  ): Promise<PluginContext> {
    const tenant = requireTenantContext();
    // Authenticated requests, public and companion plugin routes, and startup upgrades
    // already hold the tenant record and put its slug in the context. Other entry
    // points (scheduled work, socket handlers) carry only the id, so look it up.
    const tenantSlug = tenant.slug ?? (await this.findTenantSlug(tenant.tenantId));
    const runInSchema = async <T>(fn: (manager: EntityManager) => Promise<T>): Promise<T> => {
      if (options?.manager) {
        await options.manager.query(
          "SELECT set_config('search_path', quote_ident($1) || ', public', true)",
          [tenant.schemaName],
        );
        return fn(options.manager);
      }
      return this.tenantConnections.runInTenantTransaction(fn);
    };

    const member = async (userId: string): Promise<RequestUser> => {
      const rows = await runInSchema((manager) => manager.query(
        `SELECT membership.role, account.email
           FROM public.tenant_memberships membership
           JOIN public.users account ON account.id = membership.user_id
          WHERE membership.tenant_id = $1 AND membership.user_id = $2`,
        [tenant.tenantId, userId],
      ));
      if (!rows[0]) throw new ForbiddenException('Tenant membership is required');
      return { userId, tenantId: tenant.tenantId, email: rows[0].email, role: rows[0].role };
    };
    const actor = async () => member(this.requireUserId(pluginId, user));
    // Background calls (public webhook routes, event handlers) have no request user, so the
    // plugin names who acts. Either way that person needs the role permissions the matching
    // HTTP route requires; callers add the project access check.
    const writer = async (
      option: 'reporterId' | 'authorId',
      explicitId: string | undefined,
      required: RequiredPermission[],
    ): Promise<RequestUser> => {
      let userId: string;
      if (explicitId !== undefined) {
        userId = parseOrBadRequest(actorIdSchema, explicitId, option);
      } else if (user?.id) {
        userId = user.id;
      } else {
        throw new ForbiddenException(
          `Plugin ${pluginId} requires an interactive user context or an explicit ${option}`,
        );
      }
      const resolved = await member(userId);
      await this.permissions.assertPermissions(resolved, required);
      return resolved;
    };
    const assertIssueAccess = async (key: string, mode: 'read' | 'write') =>
      this.projectAccess.assertIssueKey(key, await actor(), mode);
    const accessibleIds = async () => this.projectAccess.accessibleProjectIds(await actor());

    return {
      webhooks: {
        processOnce: (digest, process) => this.inboundWebhooks.processOnce(pluginId, digest, process),
      },
      db: {
        query: async (sql: string, params?: unknown[]) => {
          return runInSchema((manager) => manager.query(sql, params));
        },
        runMigration: async (sql: string) => {
          return runInSchema((manager) => manager.query(sql));
        },
      },
      http: {
        get: async (url: string, options?: RequestOptions) =>
          this.makeRequest('GET', url, undefined, options),
        post: async (url: string, body?: unknown, options?: RequestOptions) =>
          this.makeRequest('POST', url, body, options),
        put: async (url: string, body?: unknown, options?: RequestOptions) =>
          this.makeRequest('PUT', url, body, options),
        patch: async (url: string, body?: unknown, options?: RequestOptions) =>
          this.makeRequest('PATCH', url, body, options),
        delete: async (url: string, options?: RequestOptions) =>
          this.makeRequest('DELETE', url, undefined, options),
      },
      events: {
        emit: async (event: string, data: unknown) => {
          Logger.log(`Plugin ${pluginId} emitted event: ${event}`, 'PluginContext');
          await this.eventDispatcher.emit(event, data as Record<string, unknown>);
        },
      },
      settings,
      api: {
        issues: {
          assertAccess: assertIssueAccess,
          get: async (key: string) =>
            runInSchema((manager) =>
              manager.query(`SELECT * FROM issues WHERE key = $1`, [key]),
            ).then((r) => r[0]),
          findCandidates: async (filters: PluginIssueCandidateFilters = {}) => {
            await this.assertCapability(pluginId, 'issue-candidates', options?.capabilityState);
            const userId = this.requireUserId(pluginId, user);
            return this.findIssueCandidates(runInSchema, userId, filters, await accessibleIds());
          },
          create: async (projectKey: string, input: PluginIssueCreateInput, createOptions = {}) => {
            await this.assertCapability(pluginId, 'issue-create', options?.capabilityState);
            const dto = parseOrBadRequest(pluginIssueCreateSchema, input, 'issue');
            // One transaction, so the counter, issue, and activity entry land together and
            // issue.created is dispatched only after commit.
            return runInSchema(async (manager) => {
              const reporter = await writer('reporterId', createOptions.reporterId, [
                { category: 'issues', action: 'create' },
                ...(dto.assigneeId ? [{ category: 'issues', action: 'assign' }] : []),
              ]);
              await this.projectAccess.assertProjectKey(projectKey, reporter, 'write');
              await this.memberVisibility.assertVisibleMember(reporter, dto.assigneeId);
              const issue = await this.issuesService.create(projectKey, dto, reporter.userId);
              // IssuesService.create records no activity, so the plugin path adds the entry.
              await manager.query(
                `INSERT INTO activity_logs (issue_id, user_id, action) VALUES ($1, $2, 'created')`,
                [issue.id, reporter.userId],
              );
              return toCreatedIssue(issue);
            });
          },
          update: async (key: string, data: Record<string, unknown>) => {
            const fields = Object.entries(data);
            if (fields.length === 0) {
              throw new BadRequestException('At least one issue update field is required');
            }
            for (const [field] of fields) {
              if (!ISSUE_UPDATE_FIELDS.has(field)) {
                throw new BadRequestException(
                  `Unsupported issue update field: ${field}`,
                );
              }
            }

            const sets = fields
              .map(([k], i) => `"${k}" = $${i + 2}`)
              .join(', ');
            return runInSchema((manager) =>
              manager.query(`UPDATE issues SET ${sets} WHERE key = $1 RETURNING *`, [
                key,
                ...Object.values(data),
              ]),
            ).then((r) => r[0]);
          },
          addComment: async (key: string, body: string | PluginRichTextDocument, commentOptions = {}) => {
            const document = parseOrBadRequest(
              createCommentSchema,
              { body: toCommentDocument(body) },
              'comment',
            ).body;
            return runInSchema(async (manager) => {
              const issue = await manager.query(`SELECT id FROM issues WHERE key = $1`, [key]);
              if (!issue[0]) return null;
              const author = await writer('authorId', commentOptions.authorId, [
                { category: 'comments', action: 'create' },
              ]);
              await this.projectAccess.assertIssueKey(key, author, 'write');
              const comment = await this.commentsService.create(
                key,
                { body: document },
                author.userId,
                tenant.tenantId,
              );
              return toPluginComment(comment);
            });
          },
        },
        projects: {
          accessibleIds,
          assertAccess: async (key: string, mode: 'read' | 'write') =>
            this.projectAccess.assertProjectKey(key, await actor(), mode),
          get: async (key: string) =>
            runInSchema((manager) =>
              manager.query(`SELECT * FROM projects WHERE key = $1`, [key]),
            ).then((r) => r[0]),
          list: async () => runInSchema((manager) => manager.query(`SELECT * FROM projects`)),
        },
        users: {
          get: async (id: string) => {
            // Users are in public schema, so we need the public connection
            return null; // TODO: wire up to public schema user lookup
          },
          list: async () => [],
          findMemberByEmail: async (email: string) => {
            const address = parseOrBadRequest(z.string().trim().email().max(255), email, 'email');
            const rows = await runInSchema((manager) => manager.query(
              `SELECT account.id, account.email, account.display_name AS "displayName"
                 FROM public.tenant_memberships membership
                 JOIN public.users account ON account.id = membership.user_id
                WHERE membership.tenant_id = $1 AND lower(account.email) = lower($2)
                LIMIT 1`,
              [tenant.tenantId, address],
            ));
            return rows[0] ?? null;
          },
        },
        activityLog: {
          create: async (
            issueKey: string,
            dto: {
              action: string;
              fieldName?: string | null;
              oldValue?: string | null;
              newValue?: string | null;
            },
          ) => {
            const issue = await runInSchema((manager) =>
              manager.query(`SELECT id FROM issues WHERE key = $1`, [issueKey]),
            );
            if (!issue[0]) return null;
            const result = await runInSchema((manager) =>
              manager.query(
                `INSERT INTO activity_logs (issue_id, user_id, action, field_name, old_value, new_value)
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
                [
                  issue[0].id,
                  user?.id || null,
                  dto.action,
                  dto.fieldName ?? null,
                  dto.oldValue ?? null,
                  dto.newValue ?? null,
                ],
              ),
            );
            return result[0];
          },
        },
        customFields: {
          register: async (definition: {
            name: string;
            slug: string;
            fieldType: string;
            entityType: string;
            options?: Record<string, unknown>;
            required?: boolean;
          }) => {
            const existing = await runInSchema((manager) =>
              manager.query(
                `SELECT id FROM custom_field_definitions WHERE slug = $1 AND entity_type = $2`,
                [definition.slug, definition.entityType],
              ),
            );
            if (existing.length > 0) {
              return existing[0];
            }
            const result = await runInSchema((manager) =>
              manager.query(
                `INSERT INTO custom_field_definitions (name, slug, field_type, entity_type, plugin_id, options, required)
               VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
               RETURNING *`,
                [
                  definition.name,
                  definition.slug,
                  definition.fieldType,
                  definition.entityType,
                  pluginId,
                  definition.options ? JSON.stringify(definition.options) : null,
                  definition.required || false,
                ],
              ),
            );
            return result[0];
          },
          unregisterAll: async () => {
            await runInSchema((manager) =>
              manager.query(`DELETE FROM custom_field_definitions WHERE plugin_id = $1`, [
                pluginId,
              ]),
            );
          },
        },
        timeEntries: {
          createBatch: async (request) => {
            await this.assertCapability(pluginId, 'time-entries', options?.capabilityState);
            const userId = this.requireUserId(pluginId, user);
            for (const key of new Set(request.entries.map((entry) => entry.issueKey))) {
              await assertIssueAccess(key, 'write');
            }
            return this.timeTracking.createBatch(pluginId, request, userId);
          },
          update: async (id, changes) => {
            await this.assertCapability(pluginId, 'time-entries', options?.capabilityState);
            const userId = this.requireUserId(pluginId, user);
            return this.timeTracking.updatePluginEntry(pluginId, id, changes, userId);
          },
          delete: async (id) => {
            await this.assertCapability(pluginId, 'time-entries', options?.capabilityState);
            const userId = this.requireUserId(pluginId, user);
            return this.timeTracking.deletePluginEntry(pluginId, id, userId);
          },
          deleteBatch: async (ids) => {
            await this.assertCapability(pluginId, 'time-entries', options?.capabilityState);
            const userId = this.requireUserId(pluginId, user);
            return this.timeTracking.deletePluginEntriesBatch(pluginId, ids, userId);
          },
          list: async (filters = {}) => {
            await this.assertCapability(pluginId, 'time-entries', options?.capabilityState);
            const userId = this.requireUserId(pluginId, user);
            return this.timeTracking.listPluginEntries(pluginId, filters, userId);
          },
          countOwnBySource: async (filters = {}) => {
            await this.assertCapability(pluginId, 'time-entries', options?.capabilityState);
            const userId = this.requireUserId(pluginId, user);
            return runInSchema((manager) =>
              this.timeTracking.countOwnEntriesBySource(filters, userId, manager),
            );
          },
          getLockState: async (ids) => {
            await this.assertCapability(pluginId, 'time-entries', options?.capabilityState);
            const userId = this.requireUserId(pluginId, user);
            return this.timeTracking.getPluginLockState(pluginId, ids, userId);
          },
        },
      },
      logger: {
        info: (msg: string, meta?: Record<string, unknown>) =>
          Logger.log(`[${pluginId}] ${msg}`, meta ? JSON.stringify(meta) : ''),
        warn: (msg: string, meta?: Record<string, unknown>) =>
          Logger.warn(`[${pluginId}] ${msg}`, meta ? JSON.stringify(meta) : ''),
        error: (msg: string, meta?: Record<string, unknown>) =>
          Logger.error(`[${pluginId}] ${msg}`, meta ? JSON.stringify(meta) : ''),
        debug: (msg: string, meta?: Record<string, unknown>) =>
          Logger.debug(`[${pluginId}] ${msg}`, meta ? JSON.stringify(meta) : ''),
      },
      tenant: {
        id: tenant.tenantId,
        slug: tenantSlug,
        schemaName: tenant.schemaName,
      },
      user,
    };
  }

  private async findTenantSlug(tenantId: string): Promise<string> {
    const record = await this.tenants.findById(tenantId);
    if (!record) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }
    return record.slug;
  }

  private async assertCapability(
    pluginId: string,
    capability: PluginCoreCapability,
    capabilityState?: { installed: boolean; enabled: boolean },
  ): Promise<void> {
    const manifest = this.loader.getManifest(pluginId);
    if (!manifest?.requires?.coreCapabilities?.includes(capability)) {
      throw new ForbiddenException(
        `Plugin ${pluginId} has not declared the ${capability} capability`,
      );
    }

    if (capabilityState) {
      if (capabilityState.installed && capabilityState.enabled) return;
      throw new ForbiddenException(`Plugin ${pluginId} is not installed and enabled`);
    }

    const tenant = requireTenantContext();
    const installed = await this.installedPlugins.findOne({
      where: { tenantId: tenant.tenantId, pluginId },
    });
    if (!installed?.enabled) {
      throw new ForbiddenException(`Plugin ${pluginId} is not installed and enabled`);
    }
  }

  private requireUserId(pluginId: string, user?: { id: string }): string {
    if (!user?.id) {
      throw new ForbiddenException(`Plugin ${pluginId} requires an interactive user context`);
    }
    return user.id;
  }

  private async findIssueCandidates(
    runInSchema: <T>(fn: (manager: EntityManager) => Promise<T>) => Promise<T>,
    userId: string,
    filters: PluginIssueCandidateFilters,
    projectIds: string[] | null,
  ): Promise<PluginIssueCandidate[]> {
    const parameters: unknown[] = [userId];
    const clauses = ['status.is_terminal = false'];
    if (projectIds !== null) {
      parameters.push(projectIds);
      clauses.push(`issue.project_id = ANY($${parameters.length}::uuid[])`);
    }
    if (filters.includeUnassigned) {
      clauses.push('(issue.assignee_id = $1 OR issue.assignee_id IS NULL)');
    } else {
      clauses.push('issue.assignee_id = $1');
    }
    if (filters.projectKeys?.length) {
      parameters.push(filters.projectKeys);
      clauses.push(`project.key = ANY($${parameters.length}::text[])`);
    }
    if (filters.issueKeys?.length) {
      parameters.push(filters.issueKeys);
      clauses.push(`issue.key = ANY($${parameters.length}::text[])`);
    }
    if (filters.updatedSince) {
      parameters.push(filters.updatedSince);
      clauses.push(`issue.updated_at >= $${parameters.length}::timestamptz`);
    }
    parameters.push(Math.min(Math.max(filters.limit ?? 100, 1), 200));

    const rows = await runInSchema((manager) =>
      manager.query(
        `SELECT issue.id,
                issue.key,
                issue.summary,
                project.key AS "projectKey",
                status.category AS "statusCategory",
                issue.assignee_id AS "assigneeId",
                issue.updated_at AS "updatedAt"
           FROM issues issue
           JOIN projects project ON project.id = issue.project_id
           JOIN workflow_statuses status ON status.id = issue.status_id
          WHERE ${clauses.join(' AND ')}
          ORDER BY issue.updated_at DESC
          LIMIT $${parameters.length}`,
        parameters,
      ),
    );

    return rows.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      key: row.key as string,
      summary: row.summary as string,
      projectKey: row.projectKey as string,
      statusCategory: row.statusCategory as string,
      assigneeId: (row.assigneeId as string | null) ?? null,
      updatedAt: new Date(row.updatedAt as string | Date).toISOString(),
    }));
  }

  private async makeRequest(
    method: string,
    url: string,
    body?: unknown,
    options?: RequestOptions,
  ) {
    const responseType = options?.responseType ?? 'json';
    if (responseType !== 'json' && responseType !== 'text') {
      throw new BadRequestException(`Unsupported responseType: ${String(responseType)}`);
    }
    const controller = new AbortController();
    const timeout = options?.timeout || 30000;
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetchWithSafeRedirects(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(options?.headers || {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const responseText = await readLimitedResponseText(res, MAX_RESPONSE_BYTES);
      let data: unknown = responseText;
      if (responseType === 'json') {
        try {
          data = responseText ? JSON.parse(responseText) : null;
        } catch {
          data = null;
        }
      }
      const responseHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        responseHeaders[k] = v;
      });
      return { status: res.status, data, headers: responseHeaders };
    } finally {
      clearTimeout(timer);
    }
  }
}

function parseOrBadRequest<T extends ZodTypeAny>(schema: T, value: unknown, label: string): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException({
      message: `Invalid ${label}`,
      errors: result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  return result.data;
}

function toCommentDocument(body: string | PluginRichTextDocument): unknown {
  if (typeof body !== 'string') return body;
  if (!body.trim()) throw new BadRequestException('Comment body is required');
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: body }] }] };
}

function toCreatedIssue(issue: IssueEntity): PluginCreatedIssue {
  return {
    id: issue.id,
    key: issue.key,
    projectKey: issue.key.slice(0, issue.key.lastIndexOf('-')),
    summary: issue.summary,
    statusId: issue.statusId,
    reporterId: issue.reporterId,
    assigneeId: issue.assigneeId ?? null,
    createdAt: new Date(issue.createdAt).toISOString(),
  };
}

function toPluginComment(comment: CommentEntity): PluginComment {
  return {
    id: comment.id,
    issueId: comment.issueId,
    authorId: comment.authorId,
    body: comment.body as PluginRichTextDocument,
    createdAt: new Date(comment.createdAt).toISOString(),
  };
}
