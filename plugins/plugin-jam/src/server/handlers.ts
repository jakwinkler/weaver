import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';
import type {
  PluginContext,
  PluginCreatedIssue,
  PluginIssueCreateInput,
  PluginRequest,
  PluginResponse,
  PluginRichTextDocument,
} from '@weaver/sdk';

// Server code stays in this one file because the API loads plugin TypeScript with Node's type
// stripping in development, where an extensionless relative import does not resolve.
// context.db.query returns [rows, rowCount] for a top-level UPDATE or DELETE (TypeORM's Postgres
// driver), so statements that need their RETURNING rows run inside a CTE and SELECT them.
// Design and spike evidence: docs/roadmap/30-jam-plugin.md.

const PLUGIN_ROUTE_ID = '@weaver~plugin-jam';
const JAM_MCP_URL = 'https://mcp.jam.dev/mcp';
const MCP_PROTOCOL_VERSION = '2025-06-18';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JAM_URL =
  /^https:\/\/jam\.dev\/c\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#].*)?$/i;
const SIGNATURE_TOLERANCE_SECONDS = 300;
// Minutes to wait after each failed backlink attempt; the attempt after the last wait is final.
const BACKLINK_RETRY_MINUTES = [1, 10, 60, 360];
const BACKLINK_MAX_ATTEMPTS = BACKLINK_RETRY_MINUTES.length + 1;
const PRIORITIES = ['lowest', 'low', 'medium', 'high', 'highest'] as const;
const INBOX_LIMIT = 100;
const SYNC_PAGE_SIZE = 50;
const SYNC_DETAIL_LIMIT = 20;
const DAY_MS = 86_400_000;

type Priority = (typeof PRIORITIES)[number];

// ---------------------------------------------------------------------------------------------
// Settings and plugin state

interface JamSettings {
  workspaceId: string;
  apiToken: string;
  accessExpiresOn: string;
  webhookSecret: string;
  postBacklinkComments: boolean;
}

function readSettings(context: PluginContext): JamSettings {
  const text = (key: string) =>
    typeof context.settings[key] === 'string' ? (context.settings[key] as string).trim() : '';
  return {
    workspaceId: text('jamWorkspaceId').toLowerCase(),
    apiToken: text('jamApiToken'),
    accessExpiresOn: text('jamAccessExpiresOn'),
    webhookSecret: text('jamWebhookSecret'),
    postBacklinkComments: context.settings.postBacklinkComments !== false,
  };
}

async function setState(context: PluginContext, key: string, value: string | null): Promise<void> {
  if (value === null) {
    await context.db.query('DELETE FROM jam_plugin_state WHERE key = $1', [key]);
    return;
  }
  await context.db.query(
    `INSERT INTO jam_plugin_state (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, value],
  );
}

async function readState(
  context: PluginContext,
): Promise<Record<string, { value: string; updatedAt: string }>> {
  const rows = (await context.db.query(
    'SELECT key, value, updated_at FROM jam_plugin_state',
  )) as Array<{
    key: string;
    value: string;
    updated_at: string | Date;
  }>;
  return Object.fromEntries(
    rows.map((row) => [
      row.key,
      { value: row.value, updatedAt: new Date(row.updated_at).toISOString() },
    ]),
  );
}

// ---------------------------------------------------------------------------------------------
// Small value helpers

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const json = (status: number, body: unknown): PluginResponse => ({ status, body });
const fail = (status: number, message: string): PluginResponse => ({ status, body: { message } });

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function token(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.length <= max && /^[A-Za-z0-9_.-]+$/.test(value)
    ? value
    : null;
}

function webUrl(value: unknown, protocols: string[] = ['https:', 'http:']): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return protocols.includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function emailAddress(value: unknown): string | null {
  const address = text(value, 321);
  return address && address.length <= 320 && /^[^\s@]+@[^\s@]+$/.test(address)
    ? address.toLowerCase()
    : null;
}

function isoDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function uuid(value: unknown): string | null {
  return typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null;
}

/** Accepts a Jam ID or a jam.dev/c/<id> link, with or without the https:// prefix. */
export function parseJamReference(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const id = uuid(trimmed);
  if (id) return id;
  const match = JAM_URL.exec(trimmed.startsWith('jam.dev/') ? `https://${trimmed}` : trimmed);
  return match ? match[1].toLowerCase() : null;
}

const canonicalJamUrl = (jamId: string) => `https://jam.dev/c/${jamId}`;

function statusOf(error: unknown): number | null {
  if (!isRecord(error) && !(error instanceof Error)) return null;
  const candidate = error as { status?: unknown; getStatus?: () => unknown };
  if (typeof candidate.status === 'number') return candidate.status;
  const status = typeof candidate.getStatus === 'function' ? candidate.getStatus() : null;
  return typeof status === 'number' ? status : null;
}

function withinBounds(value: unknown, maxNodes = 5000, maxDepth = 12): boolean {
  const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  let nodes = 0;
  while (pending.length) {
    const next = pending.pop()!;
    if (++nodes > maxNodes || next.depth > maxDepth) return false;
    if (typeof next.value === 'string' && next.value.length > 65_536) return false;
    if (next.value && typeof next.value === 'object') {
      for (const child of Object.values(next.value))
        pending.push({ value: child, depth: next.depth + 1 });
    }
  }
  return true;
}

// ---------------------------------------------------------------------------------------------
// Webhook signature (Standard Webhooks, as sent by Jam's Svix portal)

export function verifyJamSignature(input: {
  id?: string;
  timestamp?: string;
  signature?: string;
  body: string;
  secret: string;
  nowSeconds: number;
}): { ok: true } | { ok: false; reason: string } {
  const { id, timestamp, signature } = input;
  if (!id || !timestamp || !signature || id.length > 255 || signature.length > 4096) {
    return { ok: false, reason: 'Missing or invalid Svix signature headers' };
  }
  if (!/^\d{1,12}$/.test(timestamp)) return { ok: false, reason: 'Invalid webhook timestamp' };
  if (Math.abs(input.nowSeconds - Number(timestamp)) > SIGNATURE_TOLERANCE_SECONDS) {
    return { ok: false, reason: 'The webhook timestamp is outside the allowed window' };
  }
  const key = Buffer.from(input.secret.replace(/^whsec_/, ''), 'base64');
  if (!key.length) return { ok: false, reason: 'The webhook signing secret is invalid' };
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${input.body}`).digest();
  // Jam sends several space-separated signatures while it rotates its signing key.
  const matches = signature
    .split(' ')
    .filter((part) => part.startsWith('v1,'))
    .some((part) => {
      const provided = Buffer.from(part.slice(3), 'base64');
      return provided.length === expected.length && timingSafeEqual(provided, expected);
    });
  return matches ? { ok: true } : { ok: false, reason: 'Invalid webhook signature' };
}

// ---------------------------------------------------------------------------------------------
// Jam snapshots

interface JamSnapshot {
  jamId: string;
  teamId: string;
  jamUrl: string;
  jamType: string;
  title: string | null;
  description: string | null;
  originalUrl: string | null;
  origin: string | null;
  authorEmail: string | null;
  authorName: string | null;
  thumbnailUrl: string | null;
  systemInfo: Record<string, unknown>;
  recordingLinkPublicId: string | null;
  recordingLinkName: string | null;
  recordingReference: string | null;
  submitterComment: string | null;
  jamCreatedAt: string;
}

/** Keeps only browser, OS, screen size, and network type. Battery and the rest are dropped. */
function pickSystemInfo(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  const nameVersion = (source: unknown) =>
    isRecord(source) && text(source.name, 100)
      ? { name: text(source.name, 100), version: text(source.version, 50) }
      : null;
  const dimension = (size: unknown) =>
    typeof size === 'number' && Number.isFinite(size) && size > 0 && size < 100_000
      ? Math.round(size)
      : null;
  // The webhook calls it screen; Jam's getDetails calls it screenDimensions.
  const screen = isRecord(value.screen)
    ? value.screen
    : isRecord(value.screenDimensions)
      ? value.screenDimensions
      : null;
  const info: Record<string, unknown> = {};
  const browser = nameVersion(value.browser);
  if (browser) info.browser = browser;
  const os = nameVersion(value.os);
  if (os) info.os = os;
  if (screen && dimension(screen.width) && dimension(screen.height)) {
    info.screen = { width: dimension(screen.width), height: dimension(screen.height) };
  }
  const effectiveType = isRecord(value.connection)
    ? token(value.connection.effectiveType, 20)
    : null;
  if (effectiveType) info.connection = { effectiveType };
  return info;
}

function parseJamCreated(payload: Record<string, unknown>): JamSnapshot | null {
  const jamId = uuid(payload.jamId);
  const teamId = uuid(payload.teamId);
  const urlMatch = typeof payload.jamUrl === 'string' ? JAM_URL.exec(payload.jamUrl) : null;
  const jamType = token(payload.type, 20);
  const jamCreatedAt = isoDate(payload.createdAt);
  const author = payload.author;
  if (!jamId || !teamId || !urlMatch || urlMatch[1].toLowerCase() !== jamId) return null;
  if (!jamType || !jamCreatedAt || !isRecord(author)) return null;
  const media = isRecord(payload.media) ? payload.media : {};
  const link = isRecord(payload.recordingLink) ? payload.recordingLink : null;
  return {
    jamId,
    teamId,
    jamUrl: canonicalJamUrl(jamId),
    jamType,
    title: text(payload.title, 500),
    description: text(payload.description, 10_000),
    originalUrl: webUrl(payload.originalUrl),
    origin: token(payload.origin, 40),
    authorEmail: emailAddress(author.email),
    authorName: text(author.name, 255),
    // Media URLs work without a Jam session, so videoUrl is never stored (spike S4).
    thumbnailUrl: webUrl(media.thumbnailUrl, ['https:']) ?? webUrl(media.screenshotUrl, ['https:']),
    systemInfo: pickSystemInfo(payload.systemInfo),
    recordingLinkPublicId: link ? token(link.publicId, 64) : null,
    recordingLinkName: link ? text(link.description, 255) : null,
    recordingReference: link ? text(link.reference, 2048) : null,
    submitterComment: link ? text(link.submitterComment, 2000) : null,
    jamCreatedAt,
  };
}

/** Jam's getDetails has no page URL, media, or recording link, so those stay empty (spike S5). */
function snapshotFromDetails(details: Record<string, unknown>): JamSnapshot | null {
  const jamId = uuid(details.jamId);
  const teamId = uuid(details.teamId);
  const jamType = token(details.type, 20);
  const jamCreatedAt = isoDate(details.createdAt);
  if (!jamId || !teamId || !jamType || !jamCreatedAt) return null;
  const author = isRecord(details.author) ? details.author : {};
  return {
    jamId,
    teamId,
    jamUrl: canonicalJamUrl(jamId),
    jamType,
    title: text(details.title, 500),
    description: text(details.description, 10_000),
    originalUrl: null,
    origin: token(details.origin, 40),
    authorEmail: emailAddress(author.email),
    authorName: text(author.name, 255),
    thumbnailUrl: null,
    systemInfo: pickSystemInfo(details.systemInfo),
    recordingLinkPublicId: null,
    recordingLinkName: null,
    recordingReference: null,
    submitterComment: null,
    jamCreatedAt,
  };
}

async function insertSnapshot(
  context: PluginContext,
  snapshot: JamSnapshot,
  receivedVia: 'webhook' | 'sync' | 'manual',
  state: 'new' | 'linked',
): Promise<boolean> {
  const rows = await context.db.query(
    `INSERT INTO jam_items (
       jam_id, team_id, jam_url, jam_type, title, description, original_url, origin, author_email,
       author_name, thumbnail_url, system_info, recording_link_public_id, recording_link_name,
       recording_reference, submitter_comment, jam_created_at, received_via, state
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15, $16, $17, $18, $19)
     ON CONFLICT (jam_id) DO NOTHING
     RETURNING jam_id`,
    [
      snapshot.jamId,
      snapshot.teamId,
      snapshot.jamUrl,
      snapshot.jamType,
      snapshot.title,
      snapshot.description,
      snapshot.originalUrl,
      snapshot.origin,
      snapshot.authorEmail,
      snapshot.authorName,
      snapshot.thumbnailUrl,
      JSON.stringify(snapshot.systemInfo),
      snapshot.recordingLinkPublicId,
      snapshot.recordingLinkName,
      snapshot.recordingReference,
      snapshot.submitterComment,
      snapshot.jamCreatedAt,
      receivedVia,
      state,
    ],
  );
  return rows.length > 0;
}

interface JamRow {
  jam_id: string;
  team_id: string;
  jam_url: string;
  jam_type: string;
  title: string | null;
  description: string | null;
  original_url: string | null;
  origin: string | null;
  author_email: string | null;
  author_name: string | null;
  thumbnail_url: string | null;
  system_info: Record<string, unknown> | null;
  recording_link_name: string | null;
  submitter_comment: string | null;
  jam_created_at: string | Date;
  received_via: string;
  state: string;
  flag: string | null;
  received_at: string | Date;
}

const JAM_COLUMNS = `j.jam_id, j.team_id, j.jam_url, j.jam_type, j.title, j.description, j.original_url,
  j.origin, j.author_email, j.author_name, j.thumbnail_url, j.system_info, j.recording_link_name,
  j.submitter_comment, j.jam_created_at, j.received_via, j.state, j.flag, j.received_at`;

function toJamView(row: JamRow) {
  return {
    jamId: row.jam_id,
    jamUrl: row.jam_url,
    type: row.jam_type,
    title: row.title,
    description: row.description,
    originalUrl: row.original_url,
    origin: row.origin,
    authorName: row.author_name,
    authorEmail: row.author_email,
    thumbnailUrl: row.thumbnail_url,
    systemInfo: row.system_info ?? {},
    recordingLinkName: row.recording_link_name,
    submitterComment: row.submitter_comment,
    createdAt: new Date(row.jam_created_at).toISOString(),
    receivedVia: row.received_via,
    state: row.state,
    flag: row.flag,
    receivedAt: new Date(row.received_at).toISOString(),
  };
}

async function findJam(context: PluginContext, jamId: string): Promise<JamRow | null> {
  const rows = (await context.db.query(
    `SELECT ${JAM_COLUMNS} FROM jam_items j WHERE j.jam_id = $1`,
    [jamId],
  )) as JamRow[];
  return rows[0] ?? null;
}

async function issueIdFor(context: PluginContext, issueKey: string): Promise<string | null> {
  const issue = await context.api.issues.get(issueKey);
  return isRecord(issue) && typeof issue.id === 'string' ? issue.id : null;
}

// ---------------------------------------------------------------------------------------------
// Issue description (Weaver rich text: paragraph, heading, bulletList, hardBreak, link marks)

const textNode = (value: string) => ({ type: 'text', text: value });
const linkNode = (label: string, href: string) => ({
  type: 'text',
  text: label,
  marks: [{ type: 'link', attrs: { href } }],
});

function paragraphOf(value: string) {
  const lines = value
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean);
  return {
    type: 'paragraph',
    content: lines.flatMap((line, index) =>
      index ? [{ type: 'hardBreak' }, textNode(line)] : [textNode(line)],
    ),
  };
}

function environmentLine(info: Record<string, unknown>): string | null {
  const nameVersion = (value: unknown) =>
    isRecord(value) && typeof value.name === 'string'
      ? [value.name, typeof value.version === 'string' ? value.version : '']
          .filter(Boolean)
          .join(' ')
      : null;
  const parts: string[] = [];
  const browser = nameVersion(info.browser);
  const os = nameVersion(info.os);
  if (browser && os) parts.push(`${browser} on ${os}`);
  else if (browser || os) parts.push((browser ?? os)!);
  if (isRecord(info.screen)) parts.push(`screen ${info.screen.width}x${info.screen.height}`);
  if (isRecord(info.connection) && typeof info.connection.effectiveType === 'string') {
    parts.push(`network ${info.connection.effectiveType}`);
  }
  return parts.length ? parts.join(', ') : null;
}

function formatUtc(value: string | Date): string {
  return `${new Date(value).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

export function buildDescription(row: JamRow): PluginRichTextDocument {
  const content: unknown[] = [];
  for (const block of (row.description ?? '').split(/\n\s*\n/)) {
    if (block.trim()) content.push(paragraphOf(block));
  }
  const reporter = [row.author_name, row.author_email ? `<${row.author_email}>` : null]
    .filter(Boolean)
    .join(' ');
  const environment = environmentLine(row.system_info ?? {});
  const items: unknown[][] = [[textNode('Recording: '), linkNode('Open in Jam', row.jam_url)]];
  if (row.original_url)
    items.push([textNode('Captured on: '), linkNode(row.original_url, row.original_url)]);
  if (reporter) items.push([textNode(`Reporter: ${reporter}`)]);
  if (environment) items.push([textNode(`Environment: ${environment}`)]);
  items.push([textNode(`Captured at: ${formatUtc(row.jam_created_at)}`)]);
  if (row.recording_link_name) items.push([textNode(`Recording link: ${row.recording_link_name}`)]);
  if (row.submitter_comment) items.push([textNode(`Submitter comment: ${row.submitter_comment}`)]);
  content.push({ type: 'heading', attrs: { level: 3 }, content: [textNode('Jam')] });
  content.push({
    type: 'bulletList',
    content: items.map((inline) => ({
      type: 'listItem',
      content: [{ type: 'paragraph', content: inline }],
    })),
  });
  content.push(
    paragraphOf(
      'Console logs and network requests stay in Jam. Open the Jam for the recording and technical details.',
    ),
  );
  return { type: 'doc', content };
}

function defaultSummary(row: JamRow): string {
  if (row.title) return row.title.slice(0, 500);
  const host = row.original_url ? new URL(row.original_url).host : null;
  return host ? `Jam from ${host}` : 'Jam bug report';
}

// ---------------------------------------------------------------------------------------------
// Jam MCP client. Jam has no REST API; its MCP server is the only read and write path. It
// answers text/event-stream only and needs no session (spike S1), so each call is one request.

type JamFailureKind = 'not_configured' | 'unauthorized' | 'unavailable' | 'tool';

function jamError(kind: JamFailureKind, message: string): Error & { jamKind: JamFailureKind } {
  return Object.assign(new Error(message), { jamKind: kind });
}

function jamKindOf(error: unknown): JamFailureKind | null {
  return isRecord(error) || error instanceof Error
    ? ((error as { jamKind?: JamFailureKind }).jamKind ?? null)
    : null;
}

/** Finds the JSON-RPC reply with this id in a JSON or text/event-stream body. */
export function readRpcMessage(
  body: string,
  contentType: string,
  id: string,
): Record<string, unknown> | null {
  const candidates: unknown[] = [];
  if (contentType.includes('text/event-stream')) {
    for (const event of body.split(/\r?\n\r?\n/)) {
      const data = event
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).replace(/^ /, ''))
        .join('\n');
      if (!data) continue;
      try {
        candidates.push(JSON.parse(data));
      } catch {
        // Keep-alive comments and partial events carry no reply.
      }
    }
  } else {
    try {
      candidates.push(JSON.parse(body));
    } catch {
      return null;
    }
  }
  const reply = candidates.find((candidate) => isRecord(candidate) && candidate.id === id);
  return (reply as Record<string, unknown> | undefined) ?? null;
}

interface ToolContent {
  type?: unknown;
  text?: unknown;
}

async function callJamTool(
  context: PluginContext,
  settings: JamSettings,
  name: string,
  args: Record<string, unknown>,
  timeout = 10_000,
): Promise<ToolContent[]> {
  if (!settings.apiToken)
    throw jamError('not_configured', 'The Jam access token is not configured');
  const id = randomUUID();
  let response;
  try {
    response = await context.http.post(
      JAM_MCP_URL,
      { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } },
      {
        headers: {
          Authorization: `Bearer ${settings.apiToken}`,
          Accept: 'application/json, text/event-stream',
          'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
        },
        timeout,
        responseType: 'text',
      },
    );
  } catch (error) {
    throw jamError('unavailable', `Jam could not be reached (${(error as Error).message})`);
  }
  if (response.status === 401 || response.status === 403) {
    throw jamError('unauthorized', 'Jam rejected the access token');
  }
  if (response.status !== 200)
    throw jamError('unavailable', `Jam answered with status ${response.status}`);
  const message = readRpcMessage(
    typeof response.data === 'string' ? response.data : '',
    response.headers['content-type'] ?? '',
    id,
  );
  if (!message) throw jamError('unavailable', 'Jam sent a reply Weaver could not read');
  if (isRecord(message.error)) {
    throw jamError('tool', text(message.error.message, 300) ?? 'Jam reported an error');
  }
  const result = isRecord(message.result) ? message.result : null;
  const content =
    result && Array.isArray(result.content)
      ? (result.content.filter(isRecord) as ToolContent[])
      : [];
  if (!result || result.isError === true) {
    const detail = content.find((item) => typeof item.text === 'string')?.text as
      string | undefined;
    throw jamError('tool', detail ? detail.slice(0, 300) : 'Jam reported an error');
  }
  return content;
}

/** Most Jam tools put a JSON document in their first text item; some add a Markdown guide after it. */
async function callJamJson(
  context: PluginContext,
  settings: JamSettings,
  name: string,
  args: Record<string, unknown>,
  timeout?: number,
): Promise<Record<string, unknown>> {
  for (const item of await callJamTool(context, settings, name, args, timeout)) {
    if (item.type !== 'text' || typeof item.text !== 'string') continue;
    try {
      const value = JSON.parse(item.text);
      if (isRecord(value)) return value;
    } catch {
      // Not JSON; try the next item.
    }
  }
  throw jamError('unavailable', `Jam's ${name} reply had no JSON content`);
}

function jamFailureResponse(error: unknown): PluginResponse {
  switch (jamKindOf(error)) {
    case 'not_configured':
      return fail(400, 'Add the Jam access token in the plugin settings first');
    case 'unauthorized':
      return fail(
        502,
        'Jam rejected the access token. Create a new token and update the plugin settings.',
      );
    case 'tool':
      return fail(404, `Jam could not complete the request: ${(error as Error).message}`);
    case 'unavailable':
      return fail(502, (error as Error).message);
    default:
      throw error;
  }
}

async function noteJamFailure(context: PluginContext, error: unknown): Promise<void> {
  const kind = jamKindOf(error);
  if (kind === 'unauthorized') {
    await setState(
      context,
      'connection_error',
      'Jam rejected the access token. Create a new token and update the plugin settings.',
    );
  }
  if (kind) context.logger.warn('Jam call failed', { kind, message: (error as Error).message });
}

// ---------------------------------------------------------------------------------------------
// Links and backlink comments

function webBaseUrl(): string | null {
  const url = webUrl(process.env.WEB_URL);
  return url ? url.replace(/\/+$/, '') : null;
}

function backlinkBody(issueKey: string): string {
  const base = webBaseUrl();
  return base
    ? `Tracked in Weaver as ${issueKey}: ${base}/issues/${issueKey}`
    : `Tracked in Weaver as ${issueKey}.`;
}

async function linkJam(
  context: PluginContext,
  settings: JamSettings,
  jamId: string,
  issueId: string,
  source: 'inbox' | 'attached',
  userId: string,
): Promise<string | null> {
  const rows = (await context.db.query(
    `INSERT INTO jam_issue_links (jam_id, issue_id, link_source, linked_by, backlink_state)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (jam_id, issue_id) DO NOTHING
     RETURNING id`,
    [jamId, issueId, source, userId, settings.postBacklinkComments ? 'pending' : 'disabled'],
  )) as Array<{ id: string }>;
  await context.db.query(
    `UPDATE jam_items
        SET state = 'linked', flag = NULL,
            triaged_by = COALESCE(triaged_by, $2), triaged_at = COALESCE(triaged_at, now())
      WHERE jam_id = $1`,
    [jamId, userId],
  );
  return rows[0]?.id ?? null;
}

type BacklinkOutcome = 'posted' | 'pending' | 'failed' | 'blocked';

/** One attempt. An auth or configuration problem does not use up an attempt. */
async function attemptBacklink(
  context: PluginContext,
  settings: JamSettings,
  link: { id: string; jamId: string; issueKey: string; attempts: number },
): Promise<BacklinkOutcome> {
  try {
    await callJamTool(
      context,
      settings,
      'createComment',
      { jamId: link.jamId, body: backlinkBody(link.issueKey) },
      8_000,
    );
  } catch (error) {
    await noteJamFailure(context, error);
    const kind = jamKindOf(error);
    if (kind === 'unauthorized' || kind === 'not_configured') return 'blocked';
    if (!kind)
      context.logger.error('Unexpected backlink failure', { message: (error as Error).message });
    const attempts = link.attempts + 1;
    if (attempts >= BACKLINK_MAX_ATTEMPTS) {
      await context.db.query(
        `UPDATE jam_issue_links SET backlink_state = 'failed', backlink_attempts = $2, backlink_next_attempt_at = NULL
          WHERE id = $1`,
        [link.id, attempts],
      );
      return 'failed';
    }
    await context.db.query(
      `UPDATE jam_issue_links
          SET backlink_attempts = $2, backlink_next_attempt_at = now() + make_interval(mins => $3)
        WHERE id = $1`,
      [link.id, attempts, BACKLINK_RETRY_MINUTES[attempts - 1]],
    );
    return 'pending';
  }
  await context.db.query(
    `UPDATE jam_issue_links
        SET backlink_state = 'posted', backlink_attempts = backlink_attempts + 1, backlink_next_attempt_at = NULL
      WHERE id = $1`,
    [link.id],
  );
  return 'posted';
}

/** Posts due backlink comments, oldest first. There is no plugin scheduler, so writes drain it. */
async function drainBacklinks(
  context: PluginContext,
  settings: JamSettings,
  limit: number,
): Promise<number> {
  if (!settings.apiToken || !settings.postBacklinkComments) return 0;
  const due = (await context.db.query(
    `SELECT l.id, l.jam_id, l.backlink_attempts, i.key
       FROM jam_issue_links l JOIN issues i ON i.id = l.issue_id
      WHERE l.backlink_state = 'pending'
        AND (l.backlink_next_attempt_at IS NULL OR l.backlink_next_attempt_at <= now())
      ORDER BY l.created_at
      LIMIT $1`,
    [limit],
  )) as Array<{ id: string; jam_id: string; backlink_attempts: number; key: string }>;
  let posted = 0;
  for (const row of due) {
    const outcome = await attemptBacklink(context, settings, {
      id: row.id,
      jamId: row.jam_id,
      issueKey: row.key,
      attempts: row.backlink_attempts,
    });
    if (outcome === 'blocked') break;
    if (outcome === 'posted') posted += 1;
  }
  return posted;
}

async function backlinkNewLink(
  context: PluginContext,
  settings: JamSettings,
  linkId: string | null,
  jamId: string,
  issueKey: string,
): Promise<BacklinkOutcome | 'disabled' | 'existing'> {
  if (!linkId) return 'existing';
  if (!settings.postBacklinkComments) return 'disabled';
  if (!settings.apiToken) return 'pending';
  return attemptBacklink(context, settings, { id: linkId, jamId, issueKey, attempts: 0 });
}

// ---------------------------------------------------------------------------------------------
// Routes: webhook

export async function receiveJamWebhook(
  req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const settings = readSettings(context);
  if (!settings.webhookSecret || !settings.workspaceId)
    return fail(503, 'The Jam webhook is not configured');
  if (typeof req.rawBody !== 'string') {
    return fail(400, 'The raw request body is required to verify the signature');
  }
  const verdict = verifyJamSignature({
    id: req.headers['svix-id'],
    timestamp: req.headers['svix-timestamp'],
    signature: req.headers['svix-signature'],
    body: req.rawBody,
    secret: settings.webhookSecret,
    nowSeconds: Math.floor(Date.now() / 1000),
  });
  if (!verdict.ok) return fail(401, verdict.reason);

  let payload: unknown;
  try {
    payload = JSON.parse(req.rawBody);
  } catch {
    return fail(400, 'The webhook body is not JSON');
  }
  if (!withinBounds(payload))
    return fail(400, 'The webhook body is too large or too deeply nested');
  // Jam sends no event-name header; jam.created is the only subscribed event with a jamId.
  if (!isRecord(payload) || !('jamId' in payload)) return json(200, { message: 'Ignored event' });
  const snapshot = parseJamCreated(payload);
  if (!snapshot) return fail(400, 'Invalid jam.created payload');
  if (snapshot.teamId !== settings.workspaceId) {
    await setState(
      context,
      'connection_error',
      `A webhook arrived from Jam workspace ${snapshot.teamId}, not the configured workspace`,
    );
    return fail(400, 'The Jam belongs to a different Jam workspace');
  }

  const digest = createHash('sha256').update(`svix:${req.headers['svix-id']}`).digest('hex');
  await context.webhooks.processOnce(digest, async () => {
    if (await insertSnapshot(context, snapshot, 'webhook', 'new')) {
      await context.events.emit('jam.received', { jamId: snapshot.jamId, origin: snapshot.origin });
    }
  });
  await setState(context, 'last_webhook_at', new Date().toISOString());
  return json(200, { message: 'OK' });
}

// ---------------------------------------------------------------------------------------------
// Routes: connection

function apiWebhookUrl(tenantId: string): { url: string; isLocal: boolean } {
  const base = (webUrl(process.env.API_PUBLIC_URL) ?? 'http://localhost:3000').replace(/\/+$/, '');
  const prefix = (process.env.API_PREFIX || 'api/v1').replace(/^\/+|\/+$/g, '');
  const host = new URL(base).hostname;
  return {
    url: `${base}/${prefix}/plugin-routes/${PLUGIN_ROUTE_ID}/webhook/${tenantId}`,
    isLocal:
      host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || base.startsWith('http:'),
  };
}

function daysUntil(dateText: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return null;
  const target = Date.parse(`${dateText}T00:00:00Z`);
  if (Number.isNaN(target)) return null;
  const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.round((target - today) / DAY_MS);
}

export async function getConnection(
  _req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const settings = readSettings(context);
  const state = await readState(context);
  const [backlinks] = (await context.db.query(
    `SELECT count(*) FILTER (WHERE backlink_state = 'pending')::int AS pending,
            count(*) FILTER (WHERE backlink_state = 'failed')::int AS failed
       FROM jam_issue_links`,
  )) as Array<{ pending: number; failed: number }>;
  const webhook = apiWebhookUrl(context.tenant.id);
  return json(200, {
    webhookUrl: webhook.url,
    webhookUrlIsLocal: webhook.isLocal,
    workspaceId: settings.workspaceId || null,
    tokenConfigured: Boolean(settings.apiToken),
    webhookSecretConfigured: Boolean(settings.webhookSecret),
    accessExpiresOn: settings.accessExpiresOn || null,
    daysUntilExpiry: daysUntil(settings.accessExpiresOn),
    postBacklinkComments: settings.postBacklinkComments,
    lastWebhookAt: state.last_webhook_at?.value ?? null,
    lastVerifiedAt: state.last_verified_at?.value ?? null,
    connectionError: state.connection_error
      ? { message: state.connection_error.value, at: state.connection_error.updatedAt }
      : null,
    backlinks: { pending: backlinks?.pending ?? 0, failed: backlinks?.failed ?? 0 },
  });
}

export async function verifyConnection(
  _req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const settings = readSettings(context);
  try {
    const search = await callJamJson(context, settings, 'searchJams', { v: 1, page: { limit: 1 } });
    const first = Array.isArray(search.jams) && isRecord(search.jams[0]) ? search.jams[0] : null;
    let workspaceMatches: boolean | null = null;
    if (first && uuid(first.id) && settings.workspaceId) {
      const details = await callJamJson(context, settings, 'getDetails', { jamId: uuid(first.id) });
      workspaceMatches = uuid(details.teamId) === settings.workspaceId;
    }
    if (workspaceMatches === false) {
      await setState(
        context,
        'connection_error',
        'The token belongs to a different Jam workspace than the configured workspace ID',
      );
    } else {
      await setState(context, 'connection_error', null);
      await setState(context, 'last_verified_at', new Date().toISOString());
    }
    const backlinksPosted =
      workspaceMatches === false ? 0 : await drainBacklinks(context, settings, 10);
    return json(200, { ok: workspaceMatches !== false, workspaceMatches, backlinksPosted });
  } catch (error) {
    await noteJamFailure(context, error);
    return jamFailureResponse(error);
  }
}

export async function retryBacklinks(
  _req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const settings = readSettings(context);
  if (!settings.postBacklinkComments)
    return fail(400, 'Backlink comments are turned off in the plugin settings');
  if (!settings.apiToken) return fail(400, 'Add the Jam access token in the plugin settings first');
  const requeued = await context.db.query(
    `WITH requeued AS (
       UPDATE jam_issue_links SET backlink_state = 'pending', backlink_attempts = 0, backlink_next_attempt_at = NULL
        WHERE backlink_state = 'failed'
        RETURNING id
     ) SELECT id FROM requeued`,
  );
  await context.db.query(
    `UPDATE jam_issue_links SET backlink_next_attempt_at = NULL WHERE backlink_state = 'pending'`,
  );
  const posted = await drainBacklinks(context, settings, 10);
  return json(200, { requeued: requeued.length, posted });
}

// ---------------------------------------------------------------------------------------------
// Routes: inbox

export async function listInbox(
  req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const state = req.query.state === 'dismissed' ? 'dismissed' : 'new';
  const rows = (await context.db.query(
    `SELECT ${JAM_COLUMNS} FROM jam_items j WHERE j.state = $1 ORDER BY j.jam_created_at DESC LIMIT ${INBOX_LIMIT}`,
    [state],
  )) as JamRow[];
  const counts = (await context.db.query(
    `SELECT state, count(*)::int AS count FROM jam_items WHERE state IN ('new', 'dismissed') GROUP BY state`,
  )) as Array<{ state: string; count: number }>;
  const count = (name: string) => counts.find((row) => row.state === name)?.count ?? 0;
  return json(200, {
    items: rows.map(toJamView),
    counts: { new: count('new'), dismissed: count('dismissed') },
  });
}

interface CreateIssueBody {
  projectKey: string;
  summary?: string;
  priority?: Priority;
  issueTypeId?: string;
  assigneeId?: string;
  labels?: string[];
}

function parseCreateIssueBody(value: unknown): CreateIssueBody | { error: string } {
  if (!isRecord(value)) return { error: 'A JSON body is required' };
  const projectKey = typeof value.projectKey === 'string' ? value.projectKey.trim() : '';
  if (!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(projectKey)) return { error: 'Choose a project' };
  const body: CreateIssueBody = { projectKey };
  if (value.summary !== undefined && value.summary !== null && value.summary !== '') {
    const summary = text(value.summary, 501);
    if (!summary || summary.length > 500)
      return { error: 'The summary must be 1 to 500 characters' };
    body.summary = summary;
  }
  if (value.priority !== undefined && value.priority !== null && value.priority !== '') {
    if (!PRIORITIES.includes(value.priority as Priority)) return { error: 'Unknown priority' };
    body.priority = value.priority as Priority;
  }
  for (const field of ['issueTypeId', 'assigneeId'] as const) {
    if (value[field] === undefined || value[field] === null || value[field] === '') continue;
    const id = uuid(value[field]);
    if (!id) return { error: `Invalid ${field}` };
    body[field] = id;
  }
  if (value.labels !== undefined && value.labels !== null) {
    if (!Array.isArray(value.labels) || value.labels.length > 20)
      return { error: 'Use at most 20 labels' };
    const labels = value.labels.map((label) => text(label, 51));
    if (labels.some((label) => !label || label.length > 50))
      return { error: 'Labels must be 1 to 50 characters' };
    body.labels = [...new Set(labels as string[])];
  }
  return body;
}

/**
 * The Jam author becomes the reporter when they are a Weaver member who may report in the
 * project. Otherwise the person triaging is the reporter.
 */
async function createIssueAsReporter(
  context: PluginContext,
  projectKey: string,
  input: PluginIssueCreateInput,
  authorEmail: string | null,
  triagerId: string,
): Promise<PluginCreatedIssue> {
  const author = authorEmail ? await context.api.users.findMemberByEmail(authorEmail) : null;
  if (author && author.id !== triagerId) {
    try {
      return await context.api.issues.create(projectKey, input, { reporterId: author.id });
    } catch (error) {
      if (statusOf(error) !== 403) throw error;
    }
  }
  return context.api.issues.create(projectKey, input);
}

export async function createIssueFromJam(
  req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const user = context.user;
  if (!user) return fail(401, 'Sign in to create issues from Jams');
  const jamId = uuid(req.params.jamId);
  if (!jamId) return fail(400, 'Invalid Jam ID');
  const body = parseCreateIssueBody(req.body);
  if ('error' in body) return fail(400, body.error);
  // The person triaging must be able to create work in the project, whoever ends up as reporter.
  await context.api.projects.assertAccess(body.projectKey, 'write');

  const row = await findJam(context, jamId);
  if (!row) return fail(404, 'Jam not found');
  if (row.state !== 'new' && row.state !== 'dismissed') {
    return fail(
      409,
      row.state === 'linked'
        ? 'This Jam is already linked to an issue'
        : 'An issue is already being created for this Jam',
    );
  }
  const claimed = await context.db.query(
    `WITH claimed AS (
       UPDATE jam_items SET state = 'creating' WHERE jam_id = $1 AND state = $2 RETURNING jam_id
     ) SELECT jam_id FROM claimed`,
    [jamId, row.state],
  );
  if (!claimed.length) return fail(409, 'An issue is already being created for this Jam');

  const settings = readSettings(context);
  let issue: PluginCreatedIssue;
  try {
    const input: PluginIssueCreateInput = {
      summary: body.summary ?? defaultSummary(row),
      description: buildDescription(row),
    };
    if (body.priority) input.priority = body.priority;
    if (body.issueTypeId) input.issueTypeId = body.issueTypeId;
    if (body.assigneeId) input.assigneeId = body.assigneeId;
    if (body.labels) input.labels = body.labels;
    issue = await createIssueAsReporter(context, body.projectKey, input, row.author_email, user.id);
  } catch (error) {
    await context.db.query(
      `UPDATE jam_items SET state = $2 WHERE jam_id = $1 AND state = 'creating'`,
      [jamId, row.state],
    );
    throw error;
  }

  const linkId = await linkJam(context, settings, jamId, issue.id, 'inbox', user.id);
  const backlinkState = await backlinkNewLink(context, settings, linkId, jamId, issue.key);
  await context.events.emit('jam.linked', { jamId, issueKey: issue.key, source: 'inbox' });
  return json(201, {
    issue: { id: issue.id, key: issue.key, summary: issue.summary, reporterId: issue.reporterId },
    backlinkState,
  });
}

export async function dismissJam(
  req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const jamId = uuid(req.params.jamId);
  if (!jamId) return fail(400, 'Invalid Jam ID');
  const rows = await context.db.query(
    `WITH dismissed AS (
       UPDATE jam_items SET state = 'dismissed', triaged_by = $2, triaged_at = now()
        WHERE jam_id = $1 AND state = 'new'
        RETURNING jam_id
     ) SELECT jam_id FROM dismissed`,
    [jamId, context.user?.id ?? null],
  );
  if (rows.length) return json(200, { jamId, state: 'dismissed' });
  return (await findJam(context, jamId))
    ? fail(409, 'Only a Jam in the inbox can be dismissed')
    : fail(404, 'Jam not found');
}

export async function restoreJam(
  req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const jamId = uuid(req.params.jamId);
  if (!jamId) return fail(400, 'Invalid Jam ID');
  const rows = await context.db.query(
    `WITH restored AS (
       UPDATE jam_items SET state = 'new', triaged_by = NULL, triaged_at = NULL
        WHERE jam_id = $1 AND state = 'dismissed'
        RETURNING jam_id
     ) SELECT jam_id FROM restored`,
    [jamId],
  );
  if (rows.length) return json(200, { jamId, state: 'new' });
  return (await findJam(context, jamId))
    ? fail(409, 'Only a dismissed Jam can be restored')
    : fail(404, 'Jam not found');
}

export async function syncFromJam(
  _req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const settings = readSettings(context);
  if (!settings.workspaceId)
    return fail(400, 'Add the Jam workspace ID in the plugin settings first');
  const state = await readState(context);
  const from = state.sync_cursor?.value ?? new Date(Date.now() - 7 * DAY_MS).toISOString();
  try {
    const page = await callJamJson(context, settings, 'searchJams', {
      v: 1,
      sort: 'oldest',
      window: { from },
      page: { limit: SYNC_PAGE_SIZE },
    });
    const jams = Array.isArray(page.jams) ? page.jams.filter(isRecord) : [];
    const ids = jams.map((jam) => uuid(jam.id)).filter((id): id is string => Boolean(id));
    const known = new Set(
      (
        (await context.db.query('SELECT jam_id FROM jam_items WHERE jam_id = ANY($1::uuid[])', [
          ids,
        ])) as Array<{
          jam_id: string;
        }>
      ).map((row) => row.jam_id),
    );
    let imported = 0;
    let cursor = from;
    let truncated = false;
    for (const jam of jams) {
      const id = uuid(jam.id);
      const createdAt = isoDate(jam.createdAt);
      if (!id || !createdAt) continue;
      if (!known.has(id)) {
        if (imported >= SYNC_DETAIL_LIMIT) {
          truncated = true;
          break;
        }
        const snapshot = snapshotFromDetails(
          await callJamJson(context, settings, 'getDetails', { jamId: id }),
        );
        if (
          snapshot?.teamId === settings.workspaceId &&
          (await insertSnapshot(context, snapshot, 'sync', 'new'))
        ) {
          imported += 1;
          await context.events.emit('jam.received', { jamId: id, origin: snapshot.origin });
        }
      }
      if (createdAt > cursor) cursor = createdAt;
    }
    await setState(context, 'sync_cursor', cursor);
    const hasMore = truncated || (isRecord(page.page) && page.page.hasMore === true);
    return json(200, { imported, hasMore });
  } catch (error) {
    await noteJamFailure(context, error);
    return jamFailureResponse(error);
  }
}

// ---------------------------------------------------------------------------------------------
// Routes: issue links. The host checks project access on :issueKey before these run.

export async function listIssueJams(
  req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const issueId = await issueIdFor(context, req.params.issueKey);
  if (!issueId) return fail(404, 'Issue not found');
  const rows = (await context.db.query(
    `SELECT ${JAM_COLUMNS}, l.link_source, l.backlink_state, l.created_at AS linked_at
       FROM jam_issue_links l JOIN jam_items j ON j.jam_id = l.jam_id
      WHERE l.issue_id = $1
      ORDER BY l.created_at`,
    [issueId],
  )) as Array<JamRow & { link_source: string; backlink_state: string; linked_at: string | Date }>;
  return json(200, {
    items: rows.map((row) => ({
      ...toJamView(row),
      link: {
        source: row.link_source,
        backlinkState: row.backlink_state,
        linkedAt: new Date(row.linked_at).toISOString(),
      },
    })),
  });
}

export async function attachJam(
  req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const user = context.user;
  if (!user) return fail(401, 'Sign in to attach Jams');
  const issueKey = req.params.issueKey;
  const issueId = await issueIdFor(context, issueKey);
  if (!issueId) return fail(404, 'Issue not found');
  const reference = isRecord(req.body) ? (req.body.jamUrl ?? req.body.jamId) : undefined;
  const jamId = parseJamReference(reference);
  if (!jamId) return fail(400, 'Paste a Jam link such as https://jam.dev/c/<id>');

  const settings = readSettings(context);
  if (!(await findJam(context, jamId))) {
    if (!settings.workspaceId)
      return fail(400, 'Add the Jam workspace ID in the plugin settings first');
    let snapshot: JamSnapshot | null;
    try {
      snapshot = snapshotFromDetails(await callJamJson(context, settings, 'getDetails', { jamId }));
    } catch (error) {
      await noteJamFailure(context, error);
      return jamFailureResponse(error);
    }
    if (!snapshot) return fail(502, 'Jam returned details Weaver could not read');
    if (snapshot.teamId !== settings.workspaceId)
      return fail(400, 'That Jam belongs to a different Jam workspace');
    await insertSnapshot(context, snapshot, 'manual', 'linked');
  }

  const linkId = await linkJam(context, settings, jamId, issueId, 'attached', user.id);
  if (!linkId) return json(200, { jamId, alreadyLinked: true });
  const backlinkState = await backlinkNewLink(context, settings, linkId, jamId, issueKey);
  await context.events.emit('jam.linked', { jamId, issueKey, source: 'attached' });
  const row = await findJam(context, jamId);
  return json(201, { jam: row ? toJamView(row) : { jamId }, backlinkState });
}

export async function detachJam(
  req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const issueId = await issueIdFor(context, req.params.issueKey);
  if (!issueId) return fail(404, 'Issue not found');
  const jamId = uuid(req.params.jamId);
  if (!jamId) return fail(400, 'Invalid Jam ID');
  const removed = await context.db.query(
    `WITH removed AS (
       DELETE FROM jam_issue_links WHERE jam_id = $1 AND issue_id = $2 RETURNING id
     ) SELECT id FROM removed`,
    [jamId, issueId],
  );
  if (!removed.length) return fail(404, 'That Jam is not linked to this issue');
  // A Jam with no remaining links goes back to the inbox.
  await context.db.query(
    `UPDATE jam_items SET state = 'new', triaged_by = NULL, triaged_at = NULL
      WHERE jam_id = $1 AND NOT EXISTS (SELECT 1 FROM jam_issue_links WHERE jam_id = $1)`,
    [jamId],
  );
  await context.events.emit('jam.unlinked', { jamId, issueKey: req.params.issueKey });
  return json(200, { jamId, unlinked: true });
}
