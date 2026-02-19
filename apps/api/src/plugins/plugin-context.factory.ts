import { Injectable, Logger } from '@nestjs/common';
import type { PluginContext, RequestOptions } from '@weaver/sdk';
import { TenantConnectionProvider, requireTenantContext } from '../core/tenant';

@Injectable()
export class PluginContextFactory {
  constructor(private readonly tenantConnections: TenantConnectionProvider) {}

  async create(
    pluginId: string,
    settings: Record<string, unknown>,
    user?: { id: string; email: string; displayName: string },
  ): Promise<PluginContext> {
    const tenant = requireTenantContext();
    const em = await this.tenantConnections.getEntityManager();

    return {
      db: {
        query: async (sql: string, params?: unknown[]) => {
          return em.query(sql, params);
        },
        runMigration: async (sql: string) => {
          await em.query(sql);
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
          // Events are dispatched through the NestJS event system
          // This will be wired up when we implement the events module
          Logger.log(
            `Plugin ${pluginId} emitted event: ${event}`,
            'PluginContext',
          );
        },
      },
      settings,
      api: {
        issues: {
          get: async (key: string) =>
            em
              .query(`SELECT * FROM issues WHERE key = $1`, [key])
              .then((r) => r[0]),
          update: async (key: string, data: Record<string, unknown>) => {
            const sets = Object.entries(data)
              .map(([k], i) => `"${k}" = $${i + 2}`)
              .join(', ');
            return em
              .query(
                `UPDATE issues SET ${sets} WHERE key = $1 RETURNING *`,
                [key, ...Object.values(data)],
              )
              .then((r) => r[0]);
          },
          addComment: async (key: string, body: string) => {
            const issue = await em.query(
              `SELECT id FROM issues WHERE key = $1`,
              [key],
            );
            if (!issue[0]) return null;
            return em
              .query(
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
              )
              .then((r) => r[0]);
          },
        },
        projects: {
          get: async (key: string) =>
            em
              .query(`SELECT * FROM projects WHERE key = $1`, [key])
              .then((r) => r[0]),
          list: async () => em.query(`SELECT * FROM projects`),
        },
        users: {
          get: async (id: string) => {
            // Users are in public schema, so we need the public connection
            return null; // TODO: wire up to public schema user lookup
          },
          list: async () => [],
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
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(options?.headers || {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const data = await res.json().catch(() => null);
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
