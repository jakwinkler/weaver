import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { PluginContext, PluginCoreCapability, PluginIssueCandidate, PluginIssueCandidateFilters, RequestOptions } from '@weaver/sdk';
import { InstalledPluginEntity } from '@weaver/db';
import type { EntityManager, Repository } from 'typeorm';
import { ProjectAccessService, TenantConnectionProvider, requireTenantContext } from '../core/tenant';
import { EventDispatcherService } from '../modules/events';
import { TimeTrackingService } from '../modules/time-tracking/time-tracking.service';
import { PluginLoaderService } from './plugin-loader.service';
import { fetchWithSafeRedirects, readLimitedResponseText } from '../core/security/outbound-http';

const ISSUE_UPDATE_FIELDS = new Set(['summary', 'description', 'priority', 'assignee_id', 'custom_fields', 'sprint_id', 'parent_id', 'epic_id', 'labels', 'sort_order', 'start_date', 'due_date', 'percent_done']);

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

    const actor = async () => {
      const userId = this.requireUserId(pluginId, user);
      const rows = await runInSchema((manager) => manager.query(
        'SELECT role FROM public.tenant_memberships WHERE tenant_id = $1 AND user_id = $2',
        [tenant.tenantId, userId],
      ));
      if (!rows[0]) throw new ForbiddenException('Tenant membership is required');
      return { userId, tenantId: tenant.tenantId, email: user!.email, role: rows[0].role };
    };
    const assertIssueAccess = async (key: string, mode: 'read' | 'write') =>
      this.projectAccess.assertIssueKey(key, await actor(), mode);
    const accessibleIds = async () => this.projectAccess.accessibleProjectIds(await actor());

    return {
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
          addComment: async (key: string, body: string) => {
            const issue = await runInSchema((manager) =>
              manager.query(`SELECT id FROM issues WHERE key = $1`, [key]),
            );
            if (!issue[0]) return null;
            return runInSchema((manager) =>
              manager.query(
                `INSERT INTO comments (issue_id, author_id, body) VALUES ($1, $2, $3) RETURNING *`,
                [
                  issue[0].id,
                  user?.id,
                  JSON.stringify({
                    type: 'doc',
                    content: [
                      {
                        type: 'paragraph',
                        content: [{ type: 'text', text: body }],
                      },
                    ],
                  }),
                ],
              ),
            ).then((r) => r[0]);
          },
        },
        projects: {
          accessibleIds,
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
        slug: '',
        schemaName: tenant.schemaName,
      },
      user,
    };
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
    options?: { headers?: Record<string, string>; timeout?: number },
  ) {
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
      const responseText = await readLimitedResponseText(res, 1024 * 1024);
      let data: unknown = null;
      try {
        data = responseText ? JSON.parse(responseText) : null;
      } catch {
        data = null;
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
