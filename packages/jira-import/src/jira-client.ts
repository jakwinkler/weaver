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
  constructor(private readonly fetchImpl: FetchLike = fetch) {}

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
      if (page.isLast || values.length === 0 || projects.length >= (page.total ?? Infinity)) {
        break;
      }
      startAt += page.maxResults ?? values.length;
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

  async getFieldNames(config: JiraConnectionConfig): Promise<Record<string, string>> {
    const fields = await this.request<Array<{ id: string; name: string }>>(
      config,
      `/rest/api/${this.apiVersion(config)}/field`,
    );
    return Object.fromEntries(fields.map((field) => [field.id, field.name]));
  }

  async getIssues(config: JiraConnectionConfig, projectKeys?: string[]): Promise<JiraIssue[]> {
    const jql = this.buildProjectJql(projectKeys);
    const fields = ['*all'];
    const issues: JiraIssue[] = [];

    if (config.source === 'jira_cloud') {
      let nextPageToken: string | undefined;
      while (true) {
        const page = await this.request<Page<JiraIssue>>(config, '/rest/api/3/search/jql', {
          method: 'POST',
          body: JSON.stringify({ jql, fields, maxResults: 100, nextPageToken }),
        });
        const pageIssues = page.issues ?? [];
        issues.push(...pageIssues);
        if (page.isLast || pageIssues.length === 0 || !page.nextPageToken) break;
        nextPageToken = page.nextPageToken;
      }
      return issues;
    }

    let startAt = 0;
    while (true) {
      const page = await this.request<Page<JiraIssue>>(config, '/rest/api/2/search', {
        method: 'POST',
        body: JSON.stringify({ jql, fields, startAt, maxResults: 100 }),
      });
      const pageIssues = page.issues ?? [];
      issues.push(...pageIssues);
      if (pageIssues.length === 0 || issues.length >= (page.total ?? 0)) break;
      startAt += page.maxResults ?? pageIssues.length;
    }
    return issues;
  }

  async getComments(config: JiraConnectionConfig, issueId: string): Promise<JiraComment[]> {
    const comments: JiraComment[] = [];
    let startAt = 0;
    while (true) {
      const page = await this.request<Page<JiraComment>>(
        config,
        `/rest/api/${this.apiVersion(config)}/issue/${encodeURIComponent(issueId)}/comment?startAt=${startAt}&maxResults=100`,
      );
      const values = page.comments ?? [];
      comments.push(...values);
      if (values.length === 0 || comments.length >= (page.total ?? 0)) break;
      startAt += page.maxResults ?? values.length;
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

  async downloadAttachment(
    config: JiraConnectionConfig,
    attachment: JiraAttachment,
  ): Promise<Buffer> {
    const baseUrl = this.normalizedBaseUrl(config.baseUrl);
    const target = new URL(attachment.content, `${baseUrl}/`);
    if (target.origin !== new URL(baseUrl).origin) {
      throw new Error('Jira attachment URL points to a different origin');
    }
    const response = await this.fetchWithTimeout(target, {
      headers: this.headers(config, false),
      redirect: 'follow',
    });
    if (!response.ok) {
      throw new Error(`Jira attachment download failed (${response.status})`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  buildProjectJql(projectKeys?: string[]): string {
    if (!projectKeys) return 'ORDER BY key ASC';
    const keys = projectKeys.map((key) => `"${key.replace(/"/g, '\\"')}"`).join(', ');
    return `project in (${keys}) ORDER BY key ASC`;
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
      if (page.isLast || pageValues.length === 0 || values.length >= (page.total ?? 0)) break;
      startAt += page.maxResults ?? pageValues.length;
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
    const response = await this.fetchWithTimeout(url, {
      ...init,
      headers: { ...this.headers(config), ...(init.headers ?? {}) },
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500).replace(/\s+/g, ' ');
      throw new Error(
        `Jira request failed (${response.status} ${response.statusText})${detail ? `: ${detail}` : ''}`,
      );
    }
    return response.json() as Promise<T>;
  }

  private async fetchWithTimeout(url: URL, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
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
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error('Jira URL must use HTTP or HTTPS');
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
