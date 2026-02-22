import type { PluginContext } from '@weaver/sdk';

export async function listRepositories(
  context: PluginContext,
  params: { projectKey: string },
) {
  const project = await context.api.projects.get(params.projectKey);
  if (!project) return { status: 404, body: { message: 'Project not found' } };

  const rows = await context.db.query(
    'SELECT * FROM repository_links WHERE project_id = $1 ORDER BY created_at ASC',
    [(project as any).id],
  );

  return { status: 200, body: rows };
}

export async function addRepository(
  context: PluginContext,
  params: { projectKey: string },
  body: { name: string; url: string; provider?: string; defaultBranch?: string },
) {
  const project = await context.api.projects.get(params.projectKey);
  if (!project) return { status: 404, body: { message: 'Project not found' } };

  const rows = await context.db.query(
    `INSERT INTO repository_links (project_id, name, url, provider, default_branch)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      (project as any).id,
      body.name,
      body.url,
      body.provider || 'github',
      body.defaultBranch || 'main',
    ],
  );

  return { status: 201, body: rows[0] };
}

export async function removeRepository(
  context: PluginContext,
  params: { projectKey: string; repoId: string },
) {
  await context.db.query(
    'DELETE FROM repository_links WHERE id = $1',
    [params.repoId],
  );

  return { status: 204, body: null };
}

export async function listIssueLinks(
  context: PluginContext,
  params: { issueKey: string },
) {
  const issue = await context.api.issues.get(params.issueKey);
  if (!issue) return { status: 404, body: { message: 'Issue not found' } };

  const rows = await context.db.query(
    `SELECT irl.*, rl.name as repo_name, rl.url as repo_url
     FROM issue_repository_links irl
     LEFT JOIN repository_links rl ON rl.id = irl.repository_link_id
     WHERE irl.issue_id = $1
     ORDER BY irl.created_at ASC`,
    [(issue as any).id],
  );

  return { status: 200, body: rows };
}
