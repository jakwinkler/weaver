import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { PluginContext, RequestOptions } from '@weaver/sdk';
import { TenantConnectionProvider, requireTenantContext } from '../core/tenant';
import { EventDispatcherService } from '../modules/events';
import {
  fetchWithSafeRedirects,
  readLimitedResponseText,
} from '../core/security/outbound-http';

const ISSUE_UPDATE_FIELDS = new Set([
  'summary',
  'description',
  'priority',
  'assignee_id',
  'custom_fields',
  'sprint_id',
  'parent_id',
  'epic_id',
  'labels',
  'sort_order',
  'start_date',
  'due_date',
  'percent_done',
]);

@Injectable()
export class PluginContextFactory {
  constructor(
    private readonly tenantConnections: TenantConnectionProvider,
    private readonly eventDispatcher: EventDispatcherService,
  ) {}

  async create(
    pluginId: string,
    settings: Record<string, unknown>,
    user?: { id: string; email: string; displayName: string },
  ): Promise<PluginContext> {
    const tenant = requireTenantContext();

    const runInSchema = <T>(
      fn: (manager: EntityManager) => Promise<T>,
    ): Promise<T> => this.tenantConnections.runInTenantTransaction(fn);

    return {
      db: {
        query: async (sql: string, params?: unknown[]) => {
          return runInSchema((em) => em.query(sql, params));
        },
        runMigration: async (sql: string) => {
          return runInSchema((em) => em.query(sql));
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
          Logger.log(
            `Plugin ${pluginId} emitted event: ${event}`,
            'PluginContext',
          );
          await this.eventDispatcher.emit(
            event,
            data as Record<string, unknown>,
          );
        },
      },
      settings,
      api: {
        issues: {
          get: async (key: string) =>
            runInSchema((em) =>
              em.query(`SELECT * FROM issues WHERE key = $1`, [key]),
            ).then((r) => r[0]),
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
            return runInSchema((em) =>
              em.query(
                `UPDATE issues SET ${sets} WHERE key = $1 RETURNING *`,
                [key, ...Object.values(data)],
              ),
            ).then((r) => r[0]);
          },
          addComment: async (key: string, body: string) => {
            const issue = await runInSchema((em) =>
              em.query(`SELECT id FROM issues WHERE key = $1`, [key]),
            );
            if (!issue[0]) return null;
            return runInSchema((em) =>
              em.query(
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
          get: async (key: string) =>
            runInSchema((em) =>
              em.query(`SELECT * FROM projects WHERE key = $1`, [key]),
            ).then((r) => r[0]),
          list: async () => runInSchema((em) => em.query(`SELECT * FROM projects`)),
        },
        users: {
          get: async (id: string) => {
            // Users are in public schema, so we need the public connection
            return null; // TODO: wire up to public schema user lookup
          },
          list: async () => [],
        },
        activityLog: {
          create: async (issueKey: string, dto: {
            action: string;
            fieldName?: string | null;
            oldValue?: string | null;
            newValue?: string | null;
          }) => {
            const issue = await runInSchema((em) =>
              em.query(`SELECT id FROM issues WHERE key = $1`, [issueKey]),
            );
            if (!issue[0]) return null;
            const result = await runInSchema((em) =>
              em.query(
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
            const existing = await runInSchema((em) =>
              em.query(
                `SELECT id FROM custom_field_definitions WHERE slug = $1 AND entity_type = $2`,
                [definition.slug, definition.entityType],
              ),
            );
            if (existing.length > 0) {
              return existing[0];
            }
            const result = await runInSchema((em) =>
              em.query(
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
            await runInSchema((em) =>
              em.query(
                `DELETE FROM custom_field_definitions WHERE plugin_id = $1`,
                [pluginId],
              ),
            );
          },
        },
      },
      logger: {
        info: (msg: string, meta?: Record<string, unknown>) =>
          Logger.log(
            `[${pluginId}] ${msg}`,
            meta ? JSON.stringify(meta) : '',
          ),
        warn: (msg: string, meta?: Record<string, unknown>) =>
          Logger.warn(
            `[${pluginId}] ${msg}`,
            meta ? JSON.stringify(meta) : '',
          ),
        error: (msg: string, meta?: Record<string, unknown>) =>
          Logger.error(
            `[${pluginId}] ${msg}`,
            meta ? JSON.stringify(meta) : '',
          ),
        debug: (msg: string, meta?: Record<string, unknown>) =>
          Logger.debug(
            `[${pluginId}] ${msg}`,
            meta ? JSON.stringify(meta) : '',
          ),
      },
      tenant: {
        id: tenant.tenantId,
        slug: '',
        schemaName: tenant.schemaName,
      },
      user,
    };
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
