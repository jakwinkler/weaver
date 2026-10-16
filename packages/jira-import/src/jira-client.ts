import {
  fetchWithSafeRedirects,
  readLimitedResponseBuffer,
  readLimitedResponseText,
} from '@weaver/server-common';
import type {
  JiraAttachment,
  JiraBoard,
  JiraComment,
  JiraConnectionConfig,
  JiraIssue,
  JiraProjectDetails,
  JiraProjectIssueTypeStatuses,
  JiraProjectSummary,
  JiraSprint,
} from './types';

type FetchLike = typeof fetch;

interface Page<T> {
  values?: T[];
  issues?: T[];
  comments?: T[];
  startAt?: number;
  maxResults?: number;
  total?: number;
  isLast?: boolean;
  nextPageToken?: string;
}

export class JiraClient {
  constructor(
    private readonly fetchImpl: FetchLike = (url, init) =>
      fetchWithSafeRedirects(String(url), init),
  ) {}

  async testConnection(config: JiraConnectionConfig): Promise<void> {
    await this.request(config, `/rest/api/${this.apiVersion(config)}/myself`);
  }

  async getProjects(config: JiraConnectionConfig): Promise<JiraProjectSummary[]> {
    if (config.source === 'jira_server') {
      const result = await this.request<JiraProjectSummary[] | Page<JiraProjectSummary>>(
        config,
        '/rest/api/2/project',
      );
      return Array.isArray(result) ? result : (result.values ?? []);
    }

    const projects: JiraProjectSummary[] = [];
    let startAt = 0;
    const maxResults = 50;

    while (true) {
      const page = await this.request<Page<JiraProjectSummary>>(
        config,
        `/rest/api/3/project/search?startAt=${startAt}&maxResults=${maxResults}`,
      );
      const values = page.values ?? [];
      projects.push(...values);
      if (!values.length && (page.isLast === false || projects.length < (page.total ?? 0)))
        throw new Error('Incomplete Jira project pagination');
      if (page.isLast || values.length === 0 || projects.length >= (page.total ?? Infinity)) {
        break;
      }
      startAt += values.length;
    }

    return projects;
  }

  async getProjectDetails(
    config: JiraConnectionConfig,
    projectKey: string,
  ): Promise<JiraProjectDetails> {
    return this.request(
      config,
      `/rest/api/${this.apiVersion(config)}/project/${encodeURIComponent(projectKey)}?expand=description,issueTypes`,
    );
  }

  async getProjectStatuses(
    config: JiraConnectionConfig,
    projectKey: string,
  ): Promise<JiraProjectIssueTypeStatuses[]> {
    return this.request(
      config,
      `/rest/api/${this.apiVersion(config)}/project/${encodeURIComponent(projectKey)}/statuses`,
    );
  }

  getFieldMetadata(config: JiraConnectionConfig): Promise<Array<Record<string, any>>> {
    return this.request(config, `/rest/api/${this.apiVersion(config)}/field`);
  }

  getFilter(config: JiraConnectionConfig, id: string): Promise<Record<string, any>> {
    return this.request(
      config,
      `/rest/api/${this.apiVersion(config)}/filter/${encodeURIComponent(id)}`,
    );
  }

  async getFieldNames(config: JiraConnectionConfig): Promise<Record<string, string>> {
    const fields = await this.request<Array<{ id: string; name: string }>>(
      config,
      `/rest/api/${this.apiVersion(config)}/field`,
    );
    return Object.fromEntries(fields.map((field) => [field.id, field.name]));
  }

  async getIssues(
    config: JiraConnectionConfig,
    projectKeys?: string[],
    updatedSince?: string,
  ): Promise<JiraIssue[]> {
    const issues: JiraIssue[] = [];
    for await (const page of this.issuePages(config, projectKeys, updatedSince))
      issues.push(...page);
    return issues;
  }

  async *issuePages(
    config: JiraConnectionConfig,
    projectKeys?: string[],
    updatedSince?: string,
  ): AsyncGenerator<JiraIssue[]> {
    const jql = this.buildProjectJql(projectKeys, updatedSince);
    let startAt = 0;
    let nextPageToken: string | undefined;
    const seen = new Set<string>();
    const issueIds = new Set<string>();
    while (true) {
      const cloud = config.source === 'jira_cloud';
      const page = await this.request<Page<JiraIssue>>(
        config,
        cloud ? '/rest/api/3/search/jql' : '/rest/api/2/search',
        {
          method: 'POST',
          body: JSON.stringify({
            jql,
            fields: ['*all'],
            maxResults: 100,
            ...(cloud ? { nextPageToken } : { startAt }),
          }),
        },
      );
      const values = page.issues ?? [];
      for (const issue of values) {
        if (issueIds.has(issue.id))
          throw new Error('Jira returned a repeated issue across search pages');
        issueIds.add(issue.id);
      }
      if (!values.length && (page.isLast === false || startAt < (page.total ?? 0)))
        throw new Error('Incomplete Jira issue pagination');
      yield values;
      startAt += values.length;
      if (page.isLast || values.length === 0 || (!cloud && startAt >= (page.total ?? Infinity)))
        break;
      if (cloud) {
        if (!page.nextPageToken || seen.has(page.nextPageToken))
          throw new Error('Jira returned incomplete or repeated issue pagination');
        seen.add(page.nextPageToken);
        nextPageToken = page.nextPageToken;
      }
    }
  }

  getVersions(config: JiraConnectionConfig, key: string): Promise<Array<Record<string, any>>> {
    return this.request(
      config,
      `/rest/api/${this.apiVersion(config)}/project/${encodeURIComponent(key)}/versions`,
    );
  }

  getComponents(config: JiraConnectionConfig, key: string): Promise<Array<Record<string, any>>> {
    return this.request(
      config,
      `/rest/api/${this.apiVersion(config)}/project/${encodeURIComponent(key)}/components`,
    );
  }

  getBoards(config: JiraConnectionConfig, key: string): Promise<JiraBoard[]> {
    return this.getAgileValues(
      config,
      `/rest/agile/1.0/board?projectKeyOrId=${encodeURIComponent(key)}`,
    );
  }

  getBoardConfig(config: JiraConnectionConfig, id: string | number): Promise<Record<string, any>> {
    return this.request(
      config,
      `/rest/agile/1.0/board/${encodeURIComponent(String(id))}/configuration`,
    );
  }

  getRemoteLinks(config: JiraConnectionConfig, id: string): Promise<Array<Record<string, any>>> {
    return this.request(
      config,
      `/rest/api/${this.apiVersion(config)}/issue/${encodeURIComponent(id)}/remotelink`,
    );
  }

  async getWorklogs(config: JiraConnectionConfig, id: string): Promise<Array<Record<string, any>>> {
    return this.getIssueCollection(config, id, 'worklog', 'worklogs');
  }

  async getChangelogs(
    config: JiraConnectionConfig,
    id: string,
  ): Promise<Array<Record<string, any>>> {
    return this.getIssueCollection(config, id, 'changelog', 'values');
  }

  private async getIssueCollection(
    config: JiraConnectionConfig,
    id: string,
    path: string,
    property: string,
  ): Promise<Array<Record<string, any>>> {
    const values: Array<Record<string, any>> = [];
    const ids = new Set<string>();
    let startAt = 0;
    while (true) {
      const page = await this.request<Record<string, any>>(
        config,
        `/rest/api/${this.apiVersion(config)}/issue/${encodeURIComponent(id)}/${path}?startAt=${startAt}&maxResults=100`,
      );
      const batch = page[property] ?? [];
      for (const item of batch) {
        if (ids.has(String(item.id))) throw new Error(`Jira returned repeated ${path} records`);
        ids.add(String(item.id));
      }
      values.push(...batch);
      startAt += batch.length;
      if (page.isLast || startAt >= (page.total ?? Infinity)) break;
      if (!batch.length) throw new Error(`Incomplete Jira ${path} pagination`);
    }
    return values;
  }

  async getComments(config: JiraConnectionConfig, issueId: string): Promise<JiraComment[]> {
    const comments: JiraComment[] = [];
    const ids = new Set<string>();
    let startAt = 0;
    while (true) {
      const page = await this.request<Page<JiraComment>>(
        config,
        `/rest/api/${this.apiVersion(config)}/issue/${encodeURIComponent(issueId)}/comment?startAt=${startAt}&maxResults=100`,
      );
      const values = page.comments ?? [];
      for (const comment of values) {
        if (ids.has(comment.id)) throw new Error('Jira returned repeated comment records');
        ids.add(comment.id);
      }
      comments.push(...values);
      if (values.length === 0 && comments.length < (page.total ?? 0))
        throw new Error('Incomplete Jira comment pagination');
      if (page.isLast || comments.length >= (page.total ?? Infinity) || values.length === 0) break;
      startAt += values.length;
    }
    return comments;
  }

  async getSprints(config: JiraConnectionConfig, projectKey: string): Promise<JiraSprint[]> {
    const boards = await this.getAgileValues<JiraBoard>(
      config,
      `/rest/agile/1.0/board?projectKeyOrId=${encodeURIComponent(projectKey)}&type=scrum`,
    );
    const byId = new Map<string, JiraSprint>();
    for (const board of boards) {
      if (board.type?.toLowerCase() !== 'scrum') continue;
      const sprints = await this.getAgileValues<JiraSprint>(
        config,
        `/rest/agile/1.0/board/${board.id}/sprint`,
      );
      for (const sprint of sprints) byId.set(String(sprint.id), sprint);
    }
    return [...byId.values()];
  }

  async getAttachmentMediaId(
    config: JiraConnectionConfig,
    attachment: JiraAttachment,
  ): Promise<string | null> {
    if (config.source !== 'jira_cloud') return null;
    const target = new URL(
      `${this.normalizedBaseUrl(config.baseUrl)}/rest/api/3/attachment/content/${encodeURIComponent(attachment.id)}`,
    );
    const response = await this.fetchWithTimeout(target, {
      headers: { ...this.headers(config, false), Range: 'bytes=0-0' },
      redirect: 'manual',
    });
    try {
      if (![200, 206, 301, 302, 303, 307, 308].includes(response.status))
        throw new Error(`Jira attachment metadata failed (${response.status})`);
      const location = response.headers.get('Location');
      if (!location) return null;
      return (
        new URL(location, target).pathname.match(
          /\/file\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\//i,
        )?.[1] ?? null
      );
    } finally {
      await response.body?.cancel().catch(() => undefined);
    }
  }

  async downloadAttachment(
    config: JiraConnectionConfig,
    attachment: JiraAttachment,
  ): Promise<Buffer> {
    const baseUrl = this.normalizedBaseUrl(config.baseUrl);
    const target =
      config.source === 'jira_cloud'
        ? new URL(
            `${baseUrl}/rest/api/3/attachment/content/${encodeURIComponent(attachment.id)}?redirect=false`,
          )
        : new URL(attachment.content, `${baseUrl}/`);
    if (target.origin !== new URL(baseUrl).origin) {
      throw new Error('Jira attachment URL points to a different origin');
    }
    const response = await this.fetchWithTimeout(target, {
      headers: this.headers(config, false),
      redirect: 'manual',
    });
    if (!response.ok) {
      throw new Error(`Jira attachment download failed (${response.status})`);
    }
    return readLimitedResponseBuffer(response, 100 * 1024 * 1024);
  }

  buildProjectJql(projectKeys?: string[], updatedSince?: string): string {
    const clauses: string[] = [];
    if (projectKeys) {
      const keys = projectKeys.map((key) => `"${key.replace(/"/g, '\\"')}"`).join(', ');
      clauses.push(`project in (${keys})`);
    }
    if (updatedSince !== undefined) {
      const date = new Date(`${updatedSince}T00:00:00Z`);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(updatedSince) ||
        !Number.isFinite(date.getTime()) ||
        date.toISOString().slice(0, 10) !== updatedSince
      ) {
        throw new Error('Invalid import date');
      }
      clauses.push(`updated >= "${updatedSince}"`);
    }
    return `${clauses.length ? clauses.join(' AND ') + ' ' : ''}ORDER BY key ASC`;
  }

  private async getAgileValues<T>(config: JiraConnectionConfig, initialPath: string): Promise<T[]> {
    const values: T[] = [];
    let startAt = 0;
    while (true) {
      const separator = initialPath.includes('?') ? '&' : '?';
      const page = await this.request<Page<T>>(
        config,
        `${initialPath}${separator}startAt=${startAt}&maxResults=50`,
      );
      const pageValues = page.values ?? [];
      values.push(...pageValues);
      if (!pageValues.length && (page.isLast === false || values.length < (page.total ?? 0)))
        throw new Error('Incomplete Jira board or sprint pagination');
      if (page.isLast || pageValues.length === 0 || values.length >= (page.total ?? Infinity))
        break;
      startAt += pageValues.length;
    }
    return values;
  }

  private async request<T>(
    config: JiraConnectionConfig,
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const baseUrl = this.normalizedBaseUrl(config.baseUrl);
    const url = new URL(`${baseUrl}${path.startsWith('/') ? path : `/${path}`}`);
    for (let attempt = 0; ; attempt++) {
      const response = await this.fetchWithTimeout(url, {
        ...init,
        headers: { ...this.headers(config), ...(init.headers ?? {}) },
      });
      if (response.ok)
        return JSON.parse(await readLimitedResponseText(response, 10 * 1024 * 1024)) as T;
      await response.body?.cancel();
      if (![429, 502, 503, 504].includes(response.status) || attempt >= 3) {
        throw new Error(`Jira request failed (${response.status})`);
      }
      const retry = response.headers.get('Retry-After');
      const seconds = retry ? Number(retry) : NaN;
      const dateDelay = retry ? Date.parse(retry) - Date.now() : NaN;
      const delay = Number.isFinite(seconds)
        ? seconds * 1000
        : Number.isFinite(dateDelay)
          ? dateDelay
          : 500 * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, Math.min(30_000, Math.max(0, delay))));
    }
  }

  private async fetchWithTimeout(url: URL, init: RequestInit): Promise<Response> {
    return this.fetchImpl(url, { ...init, signal: AbortSignal.timeout(30_000) });
  }

  private headers(config: JiraConnectionConfig, json = true): Record<string, string> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (json) headers['Content-Type'] = 'application/json';

    if (config.auth.type === 'oauth') {
      headers.Authorization = `Bearer ${config.auth.accessToken}`;
    } else if (config.source === 'jira_cloud') {
      if (!config.auth.email) {
        throw new Error('Jira Cloud API-token authentication requires an email address');
      }
      headers.Authorization = `Basic ${Buffer.from(`${config.auth.email}:${config.auth.token}`).toString('base64')}`;
    } else {
      headers.Authorization = `Bearer ${config.auth.token}`;
    }
    return headers;
  }

  private normalizedBaseUrl(value: string): string {
    const url = new URL(value);
    if (url.protocol !== 'https:') {
      throw new Error('Jira URL must use HTTPS');
    }
    url.pathname = url.pathname.replace(/\/$/, '');
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  }

  private apiVersion(config: JiraConnectionConfig): '2' | '3' {
    return config.source === 'jira_cloud' ? '3' : '2';
  }
}
