import type { PluginContext } from '@weaver/sdk';

export class GitHubClient {
  private baseUrl = 'https://api.github.com';

  constructor(private readonly context: PluginContext) {}

  async createBranch(owner: string, repo: string, branchName: string, fromRef: string = 'main') {
    // Get the SHA of the source branch
    const refResponse = await this.context.http.get(
      `${this.baseUrl}/repos/${owner}/${repo}/git/refs/heads/${fromRef}`,
      { headers: this.getHeaders() },
    );

    if (refResponse.status !== 200) {
      throw new Error(`Failed to get ref: ${refResponse.status}`);
    }

    const sha = (refResponse.data as any).object.sha;

    // Create the new branch
    const response = await this.context.http.post(
      `${this.baseUrl}/repos/${owner}/${repo}/git/refs`,
      { ref: `refs/heads/${branchName}`, sha },
      { headers: this.getHeaders() },
    );

    return response;
  }

  async getCommitStatus(owner: string, repo: string, ref: string) {
    const response = await this.context.http.get(
      `${this.baseUrl}/repos/${owner}/${repo}/commits/${ref}/status`,
      { headers: this.getHeaders() },
    );
    return response.data;
  }

  private getHeaders(): Record<string, string> {
    return {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
  }
}
