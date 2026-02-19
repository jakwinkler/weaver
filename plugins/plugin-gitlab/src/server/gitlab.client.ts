import type { PluginContext } from '@weaver/sdk';

export class GitLabClient {
  private baseUrl = 'https://gitlab.com/api/v4';

  constructor(private readonly context: PluginContext) {}

  async createBranch(projectId: number | string, branchName: string, fromRef: string = 'main') {
    const response = await this.context.http.post(
      `${this.baseUrl}/projects/${encodeURIComponent(projectId)}/repository/branches`,
      { branch: branchName, ref: fromRef },
      { headers: this.getHeaders() },
    );

    if (response.status !== 201) {
      throw new Error(`Failed to create branch: ${response.status}`);
    }

    return response;
  }

  async getMergeRequests(projectId: number | string, state: string = 'opened') {
    const response = await this.context.http.get(
      `${this.baseUrl}/projects/${encodeURIComponent(projectId)}/merge_requests?state=${state}`,
      { headers: this.getHeaders() },
    );
    return response.data;
  }

  async getCommitStatus(projectId: number | string, sha: string) {
    const response = await this.context.http.get(
      `${this.baseUrl}/projects/${encodeURIComponent(projectId)}/repository/commits/${sha}/statuses`,
      { headers: this.getHeaders() },
    );
    return response.data;
  }

  private getHeaders(): Record<string, string> {
    const token = this.context.settings.gitlabToken as string | undefined;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['PRIVATE-TOKEN'] = token;
    }
    return headers;
  }
}
