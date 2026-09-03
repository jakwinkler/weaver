import type { PluginRequest, PluginResponse, PluginContext } from '@weaver/sdk';
import { createHmac, timingSafeEqual } from 'crypto';

function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expected = 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex');
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  return (
    expectedBuffer.length === signatureBuffer.length &&
    timingSafeEqual(expectedBuffer, signatureBuffer)
  );
}

export async function handleGitHubWebhook(req: PluginRequest, context: PluginContext): Promise<PluginResponse> {
  const signature = req.headers['x-hub-signature-256'];
  const event = req.headers['x-github-event'];
  const secret = context.settings.webhookSecret as string;

  if (!signature || !secret) {
    return { status: 401, body: { message: 'Missing signature or secret' } };
  }

  const payload =
    req.rawBody ??
    (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
  if (!verifySignature(payload, signature, secret)) {
    return { status: 401, body: { message: 'Invalid signature' } };
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body as Record<string, any>;

  switch (event) {
    case 'push':
      await handlePush(body, context);
      break;
    case 'pull_request':
      await handlePullRequest(body, context);
      break;
    default:
      context.logger.info(`Unhandled GitHub event: ${event}`);
  }

  return { status: 200, body: { message: 'OK' } };
}

async function handlePush(payload: Record<string, any>, context: PluginContext) {
  const commits = payload.commits || [];
  for (const commit of commits) {
    const message: string = commit.message || '';
    // Look for issue keys like WEB-123 in commit messages
    const issueKeys = message.match(/[A-Z]+-\d+/g) || [];

    for (const issueKey of issueKeys) {
      try {
        await context.db.query(
          `INSERT INTO github_links (issue_key, link_type, url, title, author, created_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (issue_key, url) DO NOTHING`,
          [issueKey, 'commit', commit.url, message.split('\n')[0].substring(0, 255), commit.author?.name || 'Unknown'],
        );
        context.logger.info(`Linked commit to ${issueKey}`);
      } catch (err) {
        context.logger.error(`Failed to link commit to ${issueKey}: ${err}`);
      }
    }
  }

  await context.events.emit('github.push_received', {
    ref: payload.ref,
    commits: commits.length,
    repository: payload.repository?.full_name,
  });
}

async function handlePullRequest(payload: Record<string, any>, context: PluginContext) {
  const pr = payload.pull_request;
  if (!pr) return;

  const title: string = pr.title || '';
  const body: string = pr.body || '';
  const text = `${title} ${body}`;
  const issueKeys = text.match(/[A-Z]+-\d+/g) || [];

  const linkType = payload.action === 'closed' && pr.merged ? 'pr_merged' : 'pull_request';

  for (const issueKey of issueKeys) {
    try {
      await context.db.query(
        `INSERT INTO github_links (issue_key, link_type, url, title, author, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (issue_key, url) DO UPDATE SET link_type = $2, status = $6`,
        [issueKey, linkType, pr.html_url, title.substring(0, 255), pr.user?.login || 'Unknown', pr.state],
      );
    } catch (err) {
      context.logger.error(`Failed to link PR to ${issueKey}: ${err}`);
    }
  }

  if (linkType === 'pr_merged') {
    await context.events.emit('github.pr_merged', {
      prNumber: pr.number,
      title: pr.title,
      issueKeys,
      repository: payload.repository?.full_name,
    });
  } else {
    await context.events.emit('github.pr_opened', {
      prNumber: pr.number,
      title: pr.title,
      action: payload.action,
      issueKeys,
    });
  }
}

export async function getGitHubLinks(req: PluginRequest, context: PluginContext): Promise<PluginResponse> {
  const issueKey = req.params.issueKey;
  if (!issueKey) {
    return { status: 400, body: { message: 'issueKey is required' } };
  }

  const links = await context.db.query(
    `SELECT * FROM github_links WHERE issue_key = $1 ORDER BY created_at DESC`,
    [issueKey],
  );

  return { status: 200, body: links };
}
