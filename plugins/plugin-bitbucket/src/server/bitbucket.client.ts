import type { PluginContext } from '@weaver/sdk';

export class BitbucketClient {
  private baseUrl = 'https://api.bitbucket.org/2.0';

  constructor(private readonly context: PluginContext) {}

  async createBranch(workspace: string, repoSlug: string, branchName: string, fromRef: string = 'main') {
    const response = await this.context.http.post(
      `${this.baseUrl}/repositories/${workspace}/${repoSlug}/refs/branches`,
      {
        name: branchName,
        target: { hash: fromRef },
      },
      { headers: this.getHeaders() },
    );

    if (response.status !== 201) {
      throw new Error(`Failed to create branch: ${response.status}`);
    }

    return response;
  }

  async getPullRequests(workspace: string, repoSlug: string, state: string = 'OPEN') {
    const response = await this.context.http.get(
      `${this.baseUrl}/repositories/${workspace}/${repoSlug}/pullrequests?state=${state}`,
      { headers: this.getHeaders() },
    );
    return response.data;
  }

  async getCommitStatuses(workspace: string, repoSlug: string, commitHash: string) {
    const response = await this.context.http.get(
      `${this.baseUrl}/repositories/${workspace}/${repoSlug}/commit/${commitHash}/statuses`,
      { headers: this.getHeaders() },
    );
    return response.data;
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }
}
