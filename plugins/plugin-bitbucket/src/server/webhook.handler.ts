import type { PluginRequest, PluginResponse, PluginContext } from '@weaver/sdk';
import { timingSafeEqual } from 'crypto';

function verifyToken(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

export async function handleBitbucketWebhook(req: PluginRequest, context: PluginContext): Promise<PluginResponse> {
  const token = req.params.token;
  const event = req.headers['x-event-key'];
  const secret = context.settings.webhookSecret as string;

  if (!token || !secret) {
    return { status: 401, body: { message: 'Missing webhook token' } };
  }

  if (!verifyToken(token, secret)) {
    return { status: 401, body: { message: 'Invalid webhook token' } };
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body as Record<string, any>;

  switch (event) {
    case 'repo:push':
      await handlePush(body, context);
      break;
    case 'pullrequest:created':
    case 'pullrequest:updated':
      await handlePullRequest(body, event, context);
      break;
    case 'pullrequest:fulfilled':
      await handlePullRequestMerged(body, context);
      break;
    default:
      context.logger.info(`Unhandled Bitbucket event: ${event}`);
  }

  return { status: 200, body: { message: 'OK' } };
}

async function handlePush(payload: Record<string, any>, context: PluginContext) {
  // Bitbucket push payload nests changes under push.changes[].commits[]
  const changes = payload.push?.changes || [];
  for (const change of changes) {
    const commits = change.commits || [];
    for (const commit of commits) {
      const message: string = commit.message || '';
      const issueKeys = message.match(/[A-Z]+-\d+/g) || [];

      const commitUrl = commit.links?.html?.href || '';

      for (const issueKey of issueKeys) {
        try {
          await context.db.query(
            `INSERT INTO bitbucket_links (issue_key, link_type, url, title, author, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())
             ON CONFLICT (issue_key, url) DO NOTHING`,
            [
              issueKey,
              'commit',
              commitUrl,
              message.split('\n')[0].substring(0, 255),
              commit.author?.user?.display_name || commit.author?.raw || 'Unknown',
            ],
          );
          context.logger.info(`Linked Bitbucket commit to ${issueKey}`);
        } catch (err) {
          context.logger.error(`Failed to link Bitbucket commit to ${issueKey}: ${err}`);
        }
      }
    }
  }

  await context.events.emit('bitbucket.push_received', {
    repository: payload.repository?.full_name,
    changes: changes.length,
  });
}

async function handlePullRequest(payload: Record<string, any>, event: string, context: PluginContext) {
  const pr = payload.pullrequest;
  if (!pr) return;

  const title: string = pr.title || '';
  const description: string = pr.description || '';
  const text = `${title} ${description}`;
  const issueKeys = text.match(/[A-Z]+-\d+/g) || [];

  const prUrl = pr.links?.html?.href || '';

  for (const issueKey of issueKeys) {
    try {
      await context.db.query(
        `INSERT INTO bitbucket_links (issue_key, link_type, url, title, author, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (issue_key, url) DO UPDATE SET status = $6`,
        [
          issueKey,
          'pull_request',
          prUrl,
          title.substring(0, 255),
          pr.author?.display_name || 'Unknown',
          pr.state,
        ],
      );
    } catch (err) {
      context.logger.error(`Failed to link Bitbucket PR to ${issueKey}: ${err}`);
    }
  }

  await context.events.emit('bitbucket.pr_opened', {
    prId: pr.id,
    title: pr.title,
    action: event,
    issueKeys,
  });
}

async function handlePullRequestMerged(payload: Record<string, any>, context: PluginContext) {
  const pr = payload.pullrequest;
  if (!pr) return;

  const title: string = pr.title || '';
  const description: string = pr.description || '';
  const text = `${title} ${description}`;
  const issueKeys = text.match(/[A-Z]+-\d+/g) || [];

  const prUrl = pr.links?.html?.href || '';

  for (const issueKey of issueKeys) {
    try {
      await context.db.query(
        `INSERT INTO bitbucket_links (issue_key, link_type, url, title, author, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (issue_key, url) DO UPDATE SET link_type = $2, status = $6`,
        [
          issueKey,
          'pr_merged',
          prUrl,
          title.substring(0, 255),
          pr.author?.display_name || 'Unknown',
          'MERGED',
        ],
      );
    } catch (err) {
      context.logger.error(`Failed to link merged Bitbucket PR to ${issueKey}: ${err}`);
    }
  }

  await context.events.emit('bitbucket.pr_merged', {
    prId: pr.id,
    title: pr.title,
    issueKeys,
    repository: payload.repository?.full_name,
  });
}

export async function getBitbucketLinks(req: PluginRequest, context: PluginContext): Promise<PluginResponse> {
  const issueKey = req.params.issueKey;
  if (!issueKey) {
    return { status: 400, body: { message: 'issueKey is required' } };
  }

  const links = await context.db.query(
    `SELECT * FROM bitbucket_links WHERE issue_key = $1 ORDER BY created_at DESC`,
    [issueKey],
  );

  return { status: 200, body: links };
}
