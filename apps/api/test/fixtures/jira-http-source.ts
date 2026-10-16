export const fixtureSource = {
  url: 'https://jira.transport.fixture.example',
  issueCount: 3,
  attachmentCount: 1,
  workloggedIssues: 3,
  largeCollections: false,
  requests: [] as string[],
  onRequest: undefined as ((url: URL) => Promise<void>) | undefined,
};

export const fixtureUser = (index: number) => ({
  accountId: `fixture-person-${index % 30}`,
  displayName: `Source person ${index % 30}`,
  accountType: 'atlassian',
  active: index % 30 !== 29,
});
export const fixtureDoc = (text: string) => ({
  type: 'doc',
  version: 1,
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});
export const fixtureStatuses = Array.from({ length: 11 }, (_, i) => ({
  id: `status-${i}`,
  name: `Status ${i}`,
  statusCategory: { key: i < 3 ? 'new' : i > 8 ? 'done' : 'indeterminate' },
}));
export const fixtureTypes = ['Task', 'Bug', 'Story', 'Epic', 'Sub-task', 'Improvement', 'Request'];
function comments(id: number) {
  const values: any[] = [
    {
      id: `${id}-public`,
      author: fixtureUser(id),
      body: fixtureDoc(`public-comment-${id}`),
      created: '2020-01-01T00:00:00Z',
      updated: '2021-01-01T00:00:00Z',
    },
    {
      id: `${id}-private`,
      author: fixtureUser(id + 1),
      body: fixtureDoc(`private-comment-${id}`),
      visibility: { type: 'role', identifier: 'internal', value: 'Internal' },
    },
    {
      id: `${id}-reply`,
      parentId: `${id}-private`,
      author: fixtureUser(id + 2),
      body: fixtureDoc(`private-reply-${id}`),
    },
  ];
  if (id === 1 && fixtureSource.largeCollections)
    for (let i = 3; i < 203; i++)
      values.push({
        id: `${id}-extra-${i}`,
        author: fixtureUser(i),
        body: fixtureDoc(`extra-${i}`),
      });
  return values;
}
function worklogs(id: number) {
  if (id > fixtureSource.workloggedIssues) return [];
  const count = id === 1 && fixtureSource.largeCollections ? 202 : 1;
  return Array.from({ length: count }, (_, i) => ({
    id: `${id}-work-${i}`,
    author: fixtureUser(i + id),
    started: '2021-01-01T12:00:00Z',
    timeSpentSeconds: 2701 + i,
    comment: fixtureDoc(`work-note-${id}-${i}`),
    ...(i % 2 ? { visibility: { type: 'role', identifier: 'internal', value: 'Internal' } } : {}),
  }));
}
export function fixtureIssue(id: number) {
  const typeIndex =
    id === 1
      ? 3
      : id > Math.ceil(fixtureSource.issueCount / 2)
        ? 4
        : id % fixtureTypes.length === 4
          ? 0
          : id % fixtureTypes.length;
  return {
    id: String(id),
    key: `GS-${id}`,
    fields: {
      summary: `Fixture issue ${id}`,
      description: fixtureDoc(`Source description ${id}`),
      status: fixtureStatuses[(id - 1) % 11],
      issuetype: {
        id: `type-${typeIndex}`,
        name: fixtureTypes[typeIndex],
        subtask: typeIndex === 4,
      },
      assignee: fixtureUser(id + 1),
      reporter: fixtureUser(id),
      creator: fixtureUser(id + 2),
      labels: ['fixture'],
      priority: { name: 'High' },
      created: '2020-01-01T00:00:00Z',
      updated: '2021-01-01T00:00:00Z',
      customfield_points: 5,
      customfield_rank: String(id).padStart(8, '0'),
      customfield_epic: id === 1 ? null : 'GS-1',
      customfield_sprint: [{ id: 42 }],
      ...(typeIndex === 4 ? { parent: { id: '2', key: 'GS-2' } } : {}),
      comment: { total: comments(id).length },
      worklog: { total: worklogs(id).length },
      fixVersions: [{ id: 'version-1', name: 'Version 1' }],
      components: [{ id: 'component-1', name: 'Backend' }],
      attachment:
        id <= fixtureSource.attachmentCount
          ? [
              {
                id: `file-${id}`,
                filename: `file-${id}.txt`,
                content: `${fixtureSource.url}/file/${id}`,
                mimeType: 'text/plain',
                size: 5,
                author: fixtureUser(id + 2),
              },
            ]
          : [],
      issuelinks:
        id === 1
          ? [{ id: 'link-1', type: { name: 'Blocks' }, outwardIssue: { id: '3', key: 'GS-3' } }]
          : [],
    },
  };
}

/** Only the source transport is synthetic. Requests still traverse the real JiraClient. */
export async function jiraFixtureTransport(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const url = new URL(String(input));
  if (url.origin !== fixtureSource.url) throw new Error('Unexpected source destination');
  fixtureSource.requests.push(url.pathname);
  await fixtureSource.onRequest?.(url);
  const page = (values: unknown[], property = 'values') => {
    const startAt = Number(url.searchParams.get('startAt') ?? 0);
    const size = Math.min(Number(url.searchParams.get('maxResults') ?? 100), 100);
    return {
      [property]: values.slice(startAt, startAt + size),
      total: values.length,
      startAt,
      maxResults: size,
      isLast: startAt + size >= values.length,
    };
  };
  let result: unknown;
  if (url.pathname.endsWith('/myself')) result = fixtureUser(0);
  else if (url.pathname.endsWith('/project/search'))
    result = page([{ id: 'project-1', key: 'GS', name: 'Synthetic GS trial' }]);
  else if (url.pathname.endsWith('/project/GS'))
    result = { id: 'project-1', key: 'GS', name: 'Synthetic GS trial', lead: fixtureUser(0) };
  else if (url.pathname.endsWith('/project/GS/statuses'))
    result = fixtureTypes.map((name, i) => ({
      id: `type-${i}`,
      name,
      subtask: i === 4,
      statuses: fixtureStatuses,
    }));
  else if (url.pathname.endsWith('/field'))
    result = [
      { id: 'customfield_points', name: 'Story points' },
      { id: 'customfield_rank', name: 'Rank' },
      { id: 'customfield_epic', name: 'Epic Link' },
      { id: 'customfield_sprint', name: 'Sprint' },
    ];
  else if (url.pathname.endsWith('/project/GS/versions'))
    result = Array.from({ length: 145 }, (_, i) => ({
      id: `version-${i + 1}`,
      name: `Version ${i + 1}`,
      released: i < 100,
    }));
  else if (url.pathname.endsWith('/project/GS/components'))
    result = ['Backend', 'Frontend', 'NetSuite'].map((name, i) => ({
      id: `component-${i + 1}`,
      name,
    }));
  else if (url.pathname === '/rest/agile/1.0/board')
    result = page(
      url.searchParams.get('type') === 'scrum'
        ? [{ id: 2, name: 'Sprint board', type: 'scrum' }]
        : [
            { id: 1, name: 'Kanban board', type: 'kanban' },
            { id: 2, name: 'Sprint board', type: 'scrum' },
          ],
    );
  else if (/\/board\/\d+\/configuration$/.test(url.pathname))
    result = {
      filter: { id: 'filter-1' },
      columnConfig: {
        columns: [
          { name: 'Backlog', statuses: fixtureStatuses.slice(0, 3) },
          ...fixtureStatuses.slice(3).map((status) => ({ name: status.name, statuses: [status] })),
        ],
      },
      subQuery: { query: 'fixVersion in unreleasedVersions() OR fixVersion is EMPTY' },
    };
  else if (url.pathname.endsWith('/filter/filter-1'))
    result = { id: 'filter-1', jql: 'project = GS ORDER BY Rank ASC' };
  else if (url.pathname.endsWith('/board/2/sprint'))
    result = page([
      { id: 41, name: 'Old sprint', state: 'closed' },
      { id: 42, name: 'Current sprint', state: 'active' },
      { id: 43, name: 'Future sprint', state: 'future' },
    ]);
  else if (url.pathname.endsWith('/search/jql')) {
    const body = JSON.parse(String(init?.body));
    const offset = Number(body.nextPageToken ?? 0);
    result = {
      issues: Array.from({ length: Math.min(100, fixtureSource.issueCount - offset) }, (_, i) =>
        fixtureIssue(offset + i + 1),
      ),
      isLast: offset + 100 >= fixtureSource.issueCount,
      ...(offset + 100 < fixtureSource.issueCount ? { nextPageToken: String(offset + 100) } : {}),
    };
  } else if (/\/attachment\/content\/file-\d+$/.test(url.pathname))
    return new Response('hello', { headers: { 'Content-Type': 'text/plain' } });
  else {
    const match = url.pathname.match(/\/issue\/(\d+)\/(comment|worklog|changelog|remotelink)$/);
    if (!match) throw new Error(`Unexpected fixture endpoint ${url.pathname}`);
    const id = Number(match[1]);
    if (match[2] === 'comment') result = page(comments(id), 'comments');
    if (match[2] === 'worklog') result = page(worklogs(id), 'worklogs');
    if (match[2] === 'changelog')
      result = page([
        {
          id: `change-${id}`,
          author: fixtureUser(id + 3),
          created: '2021-01-01T00:00:00Z',
          items: [{ field: 'status', fromString: 'New', toString: 'Testing' }],
        },
      ]);
    if (match[2] === 'remotelink')
      result = [
        {
          id: `remote-${id}`,
          object: { title: 'Source documentation', url: `https://docs.fixture.example/${id}` },
        },
      ];
  }
  return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
}
