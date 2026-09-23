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

  it('loads sprints from Scrum boards and skips Kanban boards', async () => {
    const fetchMock = jest.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/rest/agile/1.0/board?')) {
        return jsonResponse({
          isLast: true,
          values: [
            { id: 84, name: 'GRSHOP Scrum', type: 'scrum' },
            { id: 10144, name: 'GRSHOP Kanban', type: 'kanban' },
          ],
        });
      }
      if (url.includes('/rest/agile/1.0/board/84/sprint')) {
        return jsonResponse({
          isLast: true,
          values: [{ id: 9001, name: 'Recent work', state: 'closed', originBoardId: 84 }],
        });
      }
      return new Response(
        JSON.stringify({
          errorMessages: ['The board does not support sprints'],
          errors: {},
        }),
        {
          status: 400,
          statusText: 'Bad Request',
          headers: { 'Content-Type': 'application/json' },
        },
      );
    });
    const client = new JiraClient(fetchMock as typeof fetch);

    const sprints = await client.getSprints(cloudConfig, 'GRSHOP');

    expect(sprints).toEqual([
      { id: 9001, name: 'Recent work', state: 'closed', originBoardId: 84 },
    ]);
    const requestedUrls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(requestedUrls[0]).toContain('projectKeyOrId=GRSHOP&type=scrum');
    expect(requestedUrls).not.toContain(
      'https://example.atlassian.net/rest/agile/1.0/board/10144/sprint?startAt=0&maxResults=50',
    );
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
