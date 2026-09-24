import type { PluginContext, PluginRequest } from '@weaver/sdk';

export async function listRepositories(
  req: PluginRequest,
  context: PluginContext,
) {
  const params = req.params;
  const project = await context.api.projects.get(params.projectKey);
  if (!project) return { status: 404, body: { message: 'Project not found' } };

  const rows = await context.db.query(
    'SELECT * FROM repository_links WHERE project_id = $1 ORDER BY created_at ASC',
    [(project as any).id],
  );

  return { status: 200, body: rows };
}

export async function addRepository(
  req: PluginRequest,
  context: PluginContext,
) {
  const params = req.params;
  const body = req.body as { name?: unknown; url?: unknown; provider?: unknown; defaultBranch?: unknown } | undefined;
  if (!body || typeof body.name !== 'string' || !body.name.trim() || body.name.length > 255 || typeof body.url !== 'string' || body.url.length > 2048) {
    return { status: 400, body: { message: 'A name and HTTP(S) repository URL are required' } };
  }
  try {
    const url = new URL(body.url);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error();
  } catch { return { status: 400, body: { message: 'Invalid repository URL' } }; }
  if ((body.provider !== undefined && !['github', 'gitlab', 'bitbucket'].includes(String(body.provider))) ||
      (body.defaultBranch !== undefined && (typeof body.defaultBranch !== 'string' || body.defaultBranch.length > 255))) {
    return { status: 400, body: { message: 'Invalid provider or branch' } };
  }

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
  req: PluginRequest,
  context: PluginContext,
) {
  const params = req.params;
  const project = await context.api.projects.get(params.projectKey);
  if (!project) return { status: 404, body: { message: 'Project not found' } };
  await context.db.query(
    'DELETE FROM repository_links WHERE id = $1 AND project_id = $2',
    [params.repoId, (project as { id: string }).id],
  );

  return { status: 204, body: null };
}

export async function listIssueLinks(
  req: PluginRequest,
  context: PluginContext,
) {
  const params = req.params;
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
