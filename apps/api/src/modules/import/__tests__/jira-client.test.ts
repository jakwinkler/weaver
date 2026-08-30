import { JiraClient } from '@weaver/jira-import';
import type { JiraConnectionConfig } from '@weaver/shared';

const serverConfig: JiraConnectionConfig = {
  source: 'jira_server',
  baseUrl: 'https://jira.example.com/jira',
  auth: { type: 'api_token', token: 'test-token' },
};

const cloudConfig: JiraConnectionConfig = {
  source: 'jira_cloud',
  baseUrl: 'https://example.atlassian.net',
  auth: { type: 'api_token', token: 'test-token', email: 'owner@example.com' },
};

describe('JiraClient', () => {
  it('preserves a Jira Server context path and uses the selected project allowlist', async () => {
    const fetchMock = jest.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      jsonResponse({ issues: [], total: 0 }),
    );
    const client = new JiraClient(fetchMock as typeof fetch);

    await client.getIssues(serverConfig, ['ONE', 'TWO']);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://jira.example.com/jira/rest/api/2/search');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      jql: 'project in ("ONE", "TWO") ORDER BY key ASC',
      startAt: 0,
    });
  });

  it('uses Jira Cloud enhanced search and follows nextPageToken pagination', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          isLast: false,
          nextPageToken: 'next-token',
          issues: [{ id: '1', key: 'ONE-1', fields: {} }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          isLast: true,
          issues: [{ id: '2', key: 'ONE-2', fields: {} }],
        }),
      );
    const client = new JiraClient(fetchMock as typeof fetch);

    const issues = await client.getIssues(cloudConfig, ['ONE']);

    expect(issues.map((issue) => issue.key)).toEqual(['ONE-1', 'ONE-2']);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://example.atlassian.net/rest/api/3/search/jql',
    );
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toMatchObject({
      nextPageToken: 'next-token',
      jql: 'project in ("ONE") ORDER BY key ASC',
    });
  });

  it('loads every page of accessible Jira Cloud projects', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          isLast: false,
          startAt: 0,
          maxResults: 1,
          total: 2,
          values: [{ id: '1', key: 'ONE', name: 'One' }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          isLast: true,
          startAt: 1,
          maxResults: 1,
          total: 2,
          values: [{ id: '2', key: 'TWO', name: 'Two' }],
        }),
      );
    const client = new JiraClient(fetchMock as typeof fetch);

    const projects = await client.getProjects(cloudConfig);

    expect(projects.map((project) => project.key)).toEqual(['ONE', 'TWO']);
    expect(String(fetchMock.mock.calls[1][0])).toContain('startAt=1');
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
