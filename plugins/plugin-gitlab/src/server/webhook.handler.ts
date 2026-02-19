import type { PluginRequest, PluginResponse, PluginContext } from '@weaver/sdk';
import { timingSafeEqual } from 'crypto';

function verifyToken(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) {
    return false;
  }
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function handleGitLabWebhook(req: PluginRequest, context: PluginContext): Promise<PluginResponse> {
  const token = req.headers['x-gitlab-token'];
  const event = req.headers['x-gitlab-event'];
  const secret = context.settings.webhookSecret as string;

  if (!token || !secret) {
    return { status: 401, body: { message: 'Missing token or secret' } };
  }

  if (!verifyToken(token, secret)) {
    return { status: 401, body: { message: 'Invalid token' } };
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body as Record<string, any>;

  switch (event) {
    case 'Push Hook':
      await handlePush(body, context);
      break;
    case 'Merge Request Hook':
      await handleMergeRequest(body, context);
      break;
    default:
      context.logger.info(`Unhandled GitLab event: ${event}`);
  }

  return { status: 200, body: { message: 'OK' } };
}

async function handlePush(payload: Record<string, any>, context: PluginContext) {
  const commits = payload.commits || [];
  for (const commit of commits) {
    const message: string = commit.message || '';
    const issueKeys = message.match(/[A-Z]+-\d+/g) || [];

    for (const issueKey of issueKeys) {
      try {
        await context.db.query(
          `INSERT INTO gitlab_links (issue_key, link_type, url, title, author, created_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (issue_key, url) DO NOTHING`,
          [issueKey, 'commit', commit.url, message.split('\n')[0].substring(0, 255), commit.author?.name || 'Unknown'],
        );
        context.logger.info(`Linked GitLab commit to ${issueKey}`);
      } catch (err) {
        context.logger.error(`Failed to link GitLab commit to ${issueKey}: ${err}`);
      }
    }
  }

  await context.events.emit('gitlab.push_received', {
    ref: payload.ref,
    commits: commits.length,
    project: payload.project?.path_with_namespace,
  });
}

async function handleMergeRequest(payload: Record<string, any>, context: PluginContext) {
  const attrs = payload.object_attributes;
  if (!attrs) return;

  const title: string = attrs.title || '';
  const description: string = attrs.description || '';
  const text = `${title} ${description}`;
  const issueKeys = text.match(/[A-Z]+-\d+/g) || [];

  const isMerged = attrs.action === 'merge' || attrs.state === 'merged';
  const linkType = isMerged ? 'mr_merged' : 'merge_request';

  for (const issueKey of issueKeys) {
    try {
      await context.db.query(
        `INSERT INTO gitlab_links (issue_key, link_type, url, title, author, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (issue_key, url) DO UPDATE SET link_type = $2, status = $6`,
        [
          issueKey,
          linkType,
          attrs.url,
          title.substring(0, 255),
          payload.user?.username || 'Unknown',
          attrs.state,
        ],
      );
    } catch (err) {
      context.logger.error(`Failed to link GitLab MR to ${issueKey}: ${err}`);
    }
  }

  if (isMerged) {
    await context.events.emit('gitlab.mr_merged', {
      mrIid: attrs.iid,
      title: attrs.title,
      issueKeys,
      project: payload.project?.path_with_namespace,
    });
  } else {
    await context.events.emit('gitlab.mr_opened', {
      mrIid: attrs.iid,
      title: attrs.title,
      action: attrs.action,
      issueKeys,
    });
  }
}

export async function getGitLabLinks(req: PluginRequest, context: PluginContext): Promise<PluginResponse> {
  const issueKey = req.params.issueKey;
  if (!issueKey) {
    return { status: 400, body: { message: 'issueKey is required' } };
  }

  const links = await context.db.query(
    `SELECT * FROM gitlab_links WHERE issue_key = $1 ORDER BY created_at DESC`,
    [issueKey],
  );

  return { status: 200, body: links };
}
