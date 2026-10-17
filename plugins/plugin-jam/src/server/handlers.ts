import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import type {
  PluginContext,
  PluginCreatedIssue,
  PluginIssueCreateInput,
  PluginRequest,
  PluginResponse,
  PluginRichTextDocument,
} from '@weaver/sdk';

// This file is the plugin's whole server: lifecycle hooks, onEvent, and route handlers. The API
// loads plugin TypeScript with Node's type stripping in development, where an extensionless
// relative import does not resolve, so the code is not split across modules.
// context.db.query returns [rows, rowCount] for a top-level UPDATE or DELETE (TypeORM's Postgres
// driver), so statements that need their RETURNING rows run inside a CTE and SELECT them.
// Design and spike evidence: docs/roadmap/30-jam-plugin.md.

const PLUGIN_ROUTE_ID = '@weaver~plugin-jam';
const JAM_MCP_URL = 'https://mcp.jam.dev/mcp';
const MCP_PROTOCOL_VERSION = '2025-06-18';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JAM_URL =
  /^https:\/\/jam\.dev\/c\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#].*)?$/i;
// The request token Weaver puts in a recording link's jam-reference: jr=<request id>.<signature>
const REQUEST_TOKEN =
  /[?&]jr=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Za-z0-9_-]{22})(?=$|[&#])/i;
const SIGNATURE_TOLERANCE_SECONDS = 300;
// Minutes to wait after each failed backlink attempt; the attempt after the last wait is final.
const BACKLINK_RETRY_MINUTES = [1, 10, 60, 360];
const BACKLINK_MAX_ATTEMPTS = BACKLINK_RETRY_MINUTES.length + 1;
const PRIORITIES = ['lowest', 'low', 'medium', 'high', 'highest'] as const;
const INBOX_LIMIT = 100;
const SYNC_PAGE_SIZE = 50;
const SYNC_DETAIL_LIMIT = 20;
const SUMMARY_TTL_MINUTES = 60;
const DAY_MS = 86_400_000;
const WEBHOOK_JAM_TIMEOUT_MS = 4_000;

type Priority = (typeof PRIORITIES)[number];

// ---------------------------------------------------------------------------------------------
// Lifecycle. The host runs the versioned migrations on install and upgrade.

export async function onUninstall(context: PluginContext): Promise<void> {
  await context.db.runMigration(
    `DROP TABLE IF EXISTS jam_summaries, jam_issue_links, jam_recording_requests,
       jam_routing_rules, jam_items, jam_plugin_state CASCADE`,
  );
  context.logger.info('Jam plugin uninstalled');
}

export async function onEnable(context: PluginContext): Promise<void> {
  context.logger.info('Jam plugin enabled');
}

export async function onDisable(context: PluginContext): Promise<void> {
  context.logger.info('Jam plugin disabled');
}

// ---------------------------------------------------------------------------------------------
// Settings and plugin state

interface JamSettings {
  workspaceId: string;
  apiToken: string;
  accessExpiresOn: string;
  webhookSecret: string;
  recordingLinkUrl: string;
  postBacklinkComments: boolean;
  showDebugSummary: boolean;
  embedPlayer: boolean;
  notifyJamOnResolve: boolean;
  autoCreateHourlyLimit: number;
}

function readSettings(context: PluginContext): JamSettings {
  const text = (key: string) =>
    typeof context.settings[key] === 'string' ? (context.settings[key] as string).trim() : '';
  const limit = Number(context.settings.autoCreateHourlyLimit);
  return {
    workspaceId: text('jamWorkspaceId').toLowerCase(),
    apiToken: text('jamApiToken'),
    accessExpiresOn: text('jamAccessExpiresOn'),
    webhookSecret: text('jamWebhookSecret'),
    recordingLinkUrl: webUrl(text('recordingLinkUrl'), ['https:']) ?? '',
    postBacklinkComments: context.settings.postBacklinkComments !== false,
    showDebugSummary: context.settings.showDebugSummary !== false,
    embedPlayer: context.settings.embedPlayer === true,
    notifyJamOnResolve: context.settings.notifyJamOnResolve === true,
    autoCreateHourlyLimit: Number.isInteger(limit) && limit > 0 ? Math.min(limit, 500) : 20,
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
    `SELECT key, value, updated_at FROM jam_plugin_state WHERE key <> 'reference_secret'`,
  )) as Array<{ key: string; value: string; updated_at: string | Date }>;
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

// Jam stores its editor placeholder as the description when the reporter writes none (seen on
// a real Jam captured with the Chrome extension, October 17, 2026).
const JAM_PLACEHOLDER_DESCRIPTIONS = new Set(['write a description or @ to mention']);

function jamDescription(value: unknown): string | null {
  const description = text(value, 10_000);
  return description && !JAM_PLACEHOLDER_DESCRIPTIONS.has(description.toLowerCase())
    ? description
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
// Recording request references. A request's link carries jam-reference=<issue URL>?jr=<id>.<sig>.
// The signature binds the request to this tenant, so a recipient cannot point a recording at
// another issue. The request row, not the issue key in the URL, decides where the Jam goes.

async function referenceSecret(context: PluginContext): Promise<Buffer> {
  await context.db.query(
    `INSERT INTO jam_plugin_state (key, value) VALUES ('reference_secret', $1) ON CONFLICT (key) DO NOTHING`,
    [randomBytes(32).toString('base64')],
  );
  const [row] = (await context.db.query(
    `SELECT value FROM jam_plugin_state WHERE key = 'reference_secret'`,
  )) as Array<{ value: string }>;
  return Buffer.from(row.value, 'base64');
}

function signRequest(secret: Buffer, tenantId: string, requestId: string): string {
  return createHmac('sha256', secret)
    .update(`${tenantId}|${requestId}`)
    .digest()
    .subarray(0, 16)
    .toString('base64url');
}

export function parseRequestToken(
  reference: string | null,
): { requestId: string; signature: string } | null {
  if (!reference) return null;
  const match = REQUEST_TOKEN.exec(reference);
  return match ? { requestId: match[1].toLowerCase(), signature: match[2] } : null;
}

function requestReference(issueKey: string, requestId: string, signature: string): string {
  const base = webBaseUrl();
  const token = `jr=${requestId}.${signature}`;
  return base ? `${base}/issues/${issueKey}?${token}` : `weaver:${issueKey}?${token}`;
}

function recordingUrl(linkUrl: string, reference: string, title: string | null): string {
  const url = new URL(linkUrl);
  url.searchParams.set('jam-reference', reference);
  if (title) url.searchParams.set('jam-title', title);
  return url.toString();
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
    description: jamDescription(payload.description),
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
    description: jamDescription(details.description),
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
  recording_link_public_id: string | null;
  recording_link_name: string | null;
  recording_reference: string | null;
  submitter_comment: string | null;
  jam_created_at: string | Date;
  received_via: string;
  state: string;
  flag: string | null;
  suggested_project_key: string | null;
  received_at: string | Date;
}

const JAM_COLUMNS = `j.jam_id, j.team_id, j.jam_url, j.jam_type, j.title, j.description, j.original_url,
  j.origin, j.author_email, j.author_name, j.thumbnail_url, j.system_info, j.recording_link_public_id,
  j.recording_link_name, j.recording_reference, j.submitter_comment, j.jam_created_at, j.received_via,
  j.state, j.flag, sp.key AS suggested_project_key, j.received_at`;
const JAM_FROM = 'jam_items j LEFT JOIN projects sp ON sp.id = j.suggested_project_id';

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
    suggestedProjectKey: row.suggested_project_key,
    receivedAt: new Date(row.received_at).toISOString(),
  };
}

async function findJam(context: PluginContext, jamId: string): Promise<JamRow | null> {
  const rows = (await context.db.query(
    `SELECT ${JAM_COLUMNS} FROM ${JAM_FROM} WHERE j.jam_id = $1`,
    [jamId],
  )) as JamRow[];
  return rows[0] ?? null;
}

async function issueIdFor(context: PluginContext, issueKey: string): Promise<string | null> {
  const issue = await context.api.issues.get(issueKey);
  return isRecord(issue) && typeof issue.id === 'string' ? issue.id : null;
}

/** Moves a new Jam to 'creating' so two routes never act on it at once. */
async function claimJam(
  context: PluginContext,
  jamId: string,
  fromState = 'new',
): Promise<boolean> {
  const rows = await context.db.query(
    `WITH claimed AS (
       UPDATE jam_items SET state = 'creating' WHERE jam_id = $1 AND state = $2 RETURNING jam_id
     ) SELECT jam_id FROM claimed`,
    [jamId, fromState],
  );
  return rows.length > 0;
}

/** Returns a claimed Jam to the inbox, recording why it is there. */
async function releaseJam(
  context: PluginContext,
  jamId: string,
  state: string,
  flag: string | null,
  suggestedProjectId: string | null = null,
): Promise<void> {
  await context.db.query(
    `UPDATE jam_items SET state = $2, flag = COALESCE($3, flag),
            suggested_project_id = COALESCE($4, suggested_project_id)
      WHERE jam_id = $1 AND state = 'creating'`,
    [jamId, state, flag, suggestedProjectId],
  );
}

async function flagInboxJam(
  context: PluginContext,
  jamId: string,
  flag: string | null,
  suggestedProjectId: string | null,
): Promise<void> {
  await context.db.query(
    `UPDATE jam_items SET flag = COALESCE($2, flag), suggested_project_id = COALESCE($3, suggested_project_id)
      WHERE jam_id = $1 AND state = 'new'`,
    [jamId, flag, suggestedProjectId],
  );
}

// ---------------------------------------------------------------------------------------------
// Rich text (Weaver accepts paragraph, heading, bulletList, hardBreak, link marks, mentions)

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
    throw jamError('unavailable', `Jam could not be reached (${errorMessage(error)})`);
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
      return fail(404, `Jam could not complete the request: ${errorMessage(error)}`);
    case 'unavailable':
      return fail(502, errorMessage(error));
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
  if (kind) context.logger.warn('Jam call failed', { kind, message: errorMessage(error) });
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

type LinkSource = 'inbox' | 'attached' | 'recording_request' | 'rule';

async function linkJam(
  context: PluginContext,
  settings: JamSettings,
  jamId: string,
  issueId: string,
  source: LinkSource,
  userId: string | null,
  via: { requestId?: string; ruleId?: string } = {},
): Promise<string | null> {
  const rows = (await context.db.query(
    `INSERT INTO jam_issue_links (jam_id, issue_id, link_source, linked_by, backlink_state, request_id, rule_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (jam_id, issue_id) DO NOTHING
     RETURNING id`,
    [
      jamId,
      issueId,
      source,
      userId,
      settings.postBacklinkComments ? 'pending' : 'disabled',
      via.requestId ?? null,
      via.ruleId ?? null,
    ],
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
  timeout = 8_000,
): Promise<BacklinkOutcome> {
  try {
    await callJamTool(
      context,
      settings,
      'createComment',
      { jamId: link.jamId, body: backlinkBody(link.issueKey) },
      timeout,
    );
  } catch (error) {
    await noteJamFailure(context, error);
    const kind = jamKindOf(error);
    if (kind === 'unauthorized' || kind === 'not_configured') return 'blocked';
    if (!kind)
      context.logger.error('Unexpected backlink failure', { message: errorMessage(error) });
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
  timeout?: number,
): Promise<BacklinkOutcome | 'disabled' | 'existing'> {
  if (!linkId) return 'existing';
  if (!settings.postBacklinkComments) return 'disabled';
  if (!settings.apiToken) return 'pending';
  return attemptBacklink(context, settings, { id: linkId, jamId, issueKey, attempts: 0 }, timeout);
}

// ---------------------------------------------------------------------------------------------
// Issue creation

/**
 * The Jam author becomes the reporter when they are a Weaver member who may report in the
 * project. Otherwise the fallback is the reporter: the person triaging, or a rule's creator.
 */
async function createIssueAsReporter(
  context: PluginContext,
  projectKey: string,
  input: PluginIssueCreateInput,
  authorEmail: string | null,
  fallbackReporterId: string,
): Promise<PluginCreatedIssue> {
  const author = authorEmail ? await context.api.users.findMemberByEmail(authorEmail) : null;
  if (author && author.id !== fallbackReporterId) {
    try {
      return await context.api.issues.create(projectKey, input, { reporterId: author.id });
    } catch (error) {
      if (statusOf(error) !== 403) throw error;
    }
  }
  return context.api.issues.create(projectKey, input, { reporterId: fallbackReporterId });
}

function issueInput(
  row: JamRow,
  fields: {
    summary?: string;
    priority?: Priority;
    issueTypeId?: string | null;
    assigneeId?: string | null;
    labels?: string[];
  },
): PluginIssueCreateInput {
  const input: PluginIssueCreateInput = {
    summary: fields.summary ?? defaultSummary(row),
    description: buildDescription(row),
  };
  if (fields.priority) input.priority = fields.priority;
  if (fields.issueTypeId) input.issueTypeId = fields.issueTypeId;
  if (fields.assigneeId) input.assigneeId = fields.assigneeId;
  if (fields.labels?.length) input.labels = fields.labels;
  return input;
}

// ---------------------------------------------------------------------------------------------
// Routing a newly received Jam: a recording request first, then the first matching rule.
// Runs after the webhook transaction commits, so no Jam call happens while a lock is held.

interface RequestRow {
  id: string;
  issue_id: string;
  issue_key: string;
  requested_by: string;
  expires_at: string | Date;
  revoked_at: string | Date | null;
}

async function routeToRequest(
  context: PluginContext,
  settings: JamSettings,
  snapshot: JamSnapshot,
): Promise<'attached' | 'flagged' | 'none'> {
  const parsed = parseRequestToken(snapshot.recordingReference);
  if (!parsed) return 'none';
  const expected = signRequest(await referenceSecret(context), context.tenant.id, parsed.requestId);
  const provided = Buffer.from(parsed.signature);
  const valid =
    provided.length === expected.length && timingSafeEqual(provided, Buffer.from(expected));
  const [request] = valid
    ? ((await context.db.query(
        `SELECT r.id, r.issue_id, i.key AS issue_key, r.requested_by, r.expires_at, r.revoked_at
           FROM jam_recording_requests r JOIN issues i ON i.id = r.issue_id
          WHERE r.id = $1`,
        [parsed.requestId],
      )) as RequestRow[])
    : [];
  const problem = !request
    ? 'invalid_reference'
    : request.revoked_at
      ? 'request_revoked'
      : new Date(request.expires_at).getTime() < Date.now()
        ? 'request_expired'
        : null;
  if (!request || problem) {
    await flagInboxJam(context, snapshot.jamId, problem ?? 'invalid_reference', null);
    return 'flagged';
  }
  if (!(await claimJam(context, snapshot.jamId))) return 'none';
  try {
    const linkId = await linkJam(
      context,
      settings,
      snapshot.jamId,
      request.issue_id,
      'recording_request',
      request.requested_by,
      {
        requestId: request.id,
      },
    );
    await context.db.query(
      'UPDATE jam_recording_requests SET jams_received = jams_received + 1 WHERE id = $1',
      [request.id],
    );
    try {
      await context.api.issues.addComment(request.issue_key, recordingArrivedComment(snapshot), {
        authorId: request.requested_by,
      });
    } catch (error) {
      // The Jam stays linked; only the notifying comment is lost (for example, the requester
      // has since lost access to the project).
      context.logger.warn('Could not comment on the requesting issue', {
        message: errorMessage(error),
      });
    }
    await context.events.emit('jam.linked', {
      jamId: snapshot.jamId,
      issueKey: request.issue_key,
      source: 'recording_request',
    });
    await backlinkNewLink(
      context,
      settings,
      linkId,
      snapshot.jamId,
      request.issue_key,
      WEBHOOK_JAM_TIMEOUT_MS,
    );
    return 'attached';
  } catch (error) {
    await releaseJam(context, snapshot.jamId, 'new', 'routing_failed');
    context.logger.error('Could not attach a requested recording', {
      message: errorMessage(error),
    });
    return 'flagged';
  }
}

function recordingArrivedComment(snapshot: JamSnapshot): PluginRichTextDocument {
  const content: unknown[] = [
    {
      type: 'paragraph',
      content: [
        textNode('A Jam was recorded for this request: '),
        linkNode(snapshot.title ?? 'Open in Jam', snapshot.jamUrl),
      ],
    },
  ];
  if (snapshot.submitterComment)
    content.push(paragraphOf(`Comment from the recorder: ${snapshot.submitterComment}`));
  return { type: 'doc', content };
}

interface RuleMatch {
  /** Any of these hosts matches; a leading *. also matches subdomains. */
  urlHosts?: string[];
  /** A single host, as rules saved before urlHosts stored it. */
  urlHost?: string;
  /** The page path starts with this, at a segment boundary. */
  pathPrefix?: string;
  authorEmailDomain?: string;
  recordingLinkPublicId?: string;
  origin?: string;
  titlePrefix?: string;
  folder?: string;
}

interface RuleRow {
  id: string;
  position: number;
  name: string;
  enabled: boolean;
  match: RuleMatch;
  action: 'create' | 'inbox';
  project_id: string;
  project_key: string;
  project_name: string;
  issue_type_id: string | null;
  priority: Priority | null;
  labels: string[] | null;
  assignee_id: string | null;
  hourly_limit: number | null;
  created_by: string;
  created_at: string | Date;
}

const RULE_COLUMNS = `r.id, r.position, r.name, r.enabled, r.match, r.action, r.project_id, p.key AS project_key,
  p.name AS project_name, r.issue_type_id, r.priority, r.labels, r.assignee_id, r.hourly_limit, r.created_by,
  r.created_at`;

export function hostMatches(pattern: string, url: string | null): boolean {
  if (!url) return false;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  const wanted = pattern.toLowerCase();
  if (wanted.startsWith('*.')) {
    const suffix = wanted.slice(2);
    return host === suffix || host.endsWith(`.${suffix}`);
  }
  return host === wanted;
}

/** "/cart" matches /cart and /cart/step but not /cartoon; "/cart/" matches anything under it. */
export function pathMatches(prefix: string, url: string | null): boolean {
  if (!url) return false;
  let path: string;
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    return false;
  }
  const wanted = prefix.toLowerCase();
  if (wanted.endsWith('/')) return path.startsWith(wanted);
  return path === wanted || path.startsWith(`${wanted}/`);
}

function folderNames(folder: unknown): string[] {
  if (typeof folder === 'string') return [folder.toLowerCase()];
  if (!isRecord(folder)) return [];
  return ['name', 'shortId', 'id']
    .map((key) => folder[key])
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.toLowerCase());
}

/** True when every matcher the rule sets matches. A folder matcher needs Jam's getDetails. */
function ruleMatches(match: RuleMatch, snapshot: JamSnapshot, folders: string[] | null): boolean {
  const hosts = match.urlHosts ?? (match.urlHost ? [match.urlHost] : []);
  if (hosts.length && !hosts.some((pattern) => hostMatches(pattern, snapshot.originalUrl))) {
    return false;
  }
  if (match.pathPrefix && !pathMatches(match.pathPrefix, snapshot.originalUrl)) return false;
  if (match.authorEmailDomain) {
    const domain = snapshot.authorEmail?.split('@')[1];
    if (domain !== match.authorEmailDomain.toLowerCase()) return false;
  }
  if (match.recordingLinkPublicId && snapshot.recordingLinkPublicId !== match.recordingLinkPublicId)
    return false;
  if (match.origin && snapshot.origin !== match.origin) return false;
  if (
    match.titlePrefix &&
    !(snapshot.title ?? '').toLowerCase().startsWith(match.titlePrefix.toLowerCase())
  ) {
    return false;
  }
  if (match.folder && !(folders ?? []).includes(match.folder.toLowerCase())) return false;
  return true;
}

async function routeByRules(
  context: PluginContext,
  settings: JamSettings,
  snapshot: JamSnapshot,
): Promise<void> {
  const rules = (await context.db.query(
    `SELECT ${RULE_COLUMNS} FROM jam_routing_rules r JOIN projects p ON p.id = r.project_id
      WHERE r.enabled ORDER BY r.position, r.created_at`,
  )) as RuleRow[];
  if (!rules.length) return;

  let folders: string[] | null = null;
  if (rules.some((rule) => rule.match.folder)) {
    try {
      const details = await callJamJson(
        context,
        settings,
        'getDetails',
        { jamId: snapshot.jamId },
        WEBHOOK_JAM_TIMEOUT_MS,
      );
      folders = folderNames(details.folder);
    } catch (error) {
      await noteJamFailure(context, error);
      await flagInboxJam(context, snapshot.jamId, 'routing_lookup_failed', null);
      // Rules without a folder matcher still apply.
    }
  }

  const rule = rules.find((candidate) => ruleMatches(candidate.match, snapshot, folders));
  if (!rule) return;
  if (rule.action === 'inbox') {
    await flagInboxJam(context, snapshot.jamId, null, rule.project_id);
    return;
  }

  const limit = rule.hourly_limit ?? settings.autoCreateHourlyLimit;
  const [{ recent }] = (await context.db.query(
    `SELECT count(*)::int AS recent FROM jam_issue_links WHERE rule_id = $1 AND created_at > now() - interval '1 hour'`,
    [rule.id],
  )) as Array<{ recent: number }>;
  if (recent >= limit) {
    await flagInboxJam(context, snapshot.jamId, 'rate_limited', rule.project_id);
    return;
  }

  if (!(await claimJam(context, snapshot.jamId))) return;
  try {
    const row = (await findJam(context, snapshot.jamId))!;
    const issue = await createIssueAsReporter(
      context,
      rule.project_key,
      issueInput(row, {
        priority: rule.priority ?? undefined,
        issueTypeId: rule.issue_type_id,
        assigneeId: rule.assignee_id,
        labels: rule.labels ?? [],
      }),
      row.author_email,
      rule.created_by,
    );
    const linkId = await linkJam(context, settings, snapshot.jamId, issue.id, 'rule', null, {
      ruleId: rule.id,
    });
    await context.events.emit('jam.linked', {
      jamId: snapshot.jamId,
      issueKey: issue.key,
      source: 'rule',
    });
    await backlinkNewLink(
      context,
      settings,
      linkId,
      snapshot.jamId,
      issue.key,
      WEBHOOK_JAM_TIMEOUT_MS,
    );
  } catch (error) {
    await releaseJam(context, snapshot.jamId, 'new', 'rule_failed', rule.project_id);
    context.logger.warn('A Jam routing rule could not create an issue', {
      rule: rule.name,
      message: errorMessage(error),
    });
  }
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
  const outcome = { inserted: false };
  await context.webhooks.processOnce(digest, async () => {
    outcome.inserted = await insertSnapshot(context, snapshot, 'webhook', 'new');
    if (outcome.inserted) {
      await context.events.emit('jam.received', { jamId: snapshot.jamId, origin: snapshot.origin });
    }
  });
  await setState(context, 'last_webhook_at', new Date().toISOString());
  // Routing runs once, for the delivery that stored the Jam. If it fails part way, the Jam
  // stays in the inbox with a flag rather than being retried into a duplicate issue.
  if (outcome.inserted && (await routeToRequest(context, settings, snapshot)) === 'none') {
    await routeByRules(context, settings, snapshot);
  }
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
    recordingLinkConfigured: Boolean(settings.recordingLinkUrl),
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
    `SELECT ${JAM_COLUMNS} FROM ${JAM_FROM} WHERE j.state = $1 ORDER BY j.jam_created_at DESC LIMIT ${INBOX_LIMIT}`,
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

interface IssueFields {
  summary?: string;
  priority?: Priority;
  issueTypeId?: string;
  assigneeId?: string;
  labels?: string[];
}

function parseIssueFields(value: Record<string, unknown>): IssueFields | { error: string } {
  const fields: IssueFields = {};
  if (value.summary !== undefined && value.summary !== null && value.summary !== '') {
    const summary = text(value.summary, 501);
    if (!summary || summary.length > 500)
      return { error: 'The summary must be 1 to 500 characters' };
    fields.summary = summary;
  }
  if (value.priority !== undefined && value.priority !== null && value.priority !== '') {
    if (!PRIORITIES.includes(value.priority as Priority)) return { error: 'Unknown priority' };
    fields.priority = value.priority as Priority;
  }
  for (const field of ['issueTypeId', 'assigneeId'] as const) {
    if (value[field] === undefined || value[field] === null || value[field] === '') continue;
    const id = uuid(value[field]);
    if (!id) return { error: `Invalid ${field}` };
    fields[field] = id;
  }
  if (value.labels !== undefined && value.labels !== null) {
    if (!Array.isArray(value.labels) || value.labels.length > 20)
      return { error: 'Use at most 20 labels' };
    const labels = value.labels.map((label) => text(label, 51));
    if (labels.some((label) => !label || label.length > 50))
      return { error: 'Labels must be 1 to 50 characters' };
    fields.labels = [...new Set(labels as string[])];
  }
  return fields;
}

function parseProjectKey(value: unknown): string | null {
  const key = typeof value === 'string' ? value.trim() : '';
  return /^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(key) ? key : null;
}

export async function createIssueFromJam(
  req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const user = context.user;
  if (!user) return fail(401, 'Sign in to create issues from Jams');
  const jamId = uuid(req.params.jamId);
  if (!jamId) return fail(400, 'Invalid Jam ID');
  if (!isRecord(req.body)) return fail(400, 'A JSON body is required');
  const projectKey = parseProjectKey(req.body.projectKey);
  if (!projectKey) return fail(400, 'Choose a project');
  const fields = parseIssueFields(req.body);
  if ('error' in fields) return fail(400, fields.error);
  // The person triaging must be able to create work in the project, whoever ends up as reporter.
  await context.api.projects.assertAccess(projectKey, 'write');

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
  if (!(await claimJam(context, jamId, row.state)))
    return fail(409, 'An issue is already being created for this Jam');

  const settings = readSettings(context);
  let issue: PluginCreatedIssue;
  try {
    issue = await createIssueAsReporter(
      context,
      projectKey,
      issueInput(row, fields),
      row.author_email,
      user.id,
    );
  } catch (error) {
    await releaseJam(context, jamId, row.state, null);
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
          // Synced Jams carry no recording reference, so a shared request link cannot be matched.
          if (snapshot.origin === 'recording_link') {
            await flagInboxJam(context, id, 'recording_request_unmatched', null);
          }
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
  const settings = readSettings(context);
  const rows = (await context.db.query(
    `SELECT ${JAM_COLUMNS}, l.link_source, l.backlink_state, l.created_at AS linked_at
       FROM jam_issue_links l JOIN ${JAM_FROM} ON j.jam_id = l.jam_id
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
    display: {
      showDebugSummary: settings.showDebugSummary && Boolean(settings.apiToken),
      embedPlayer: settings.embedPlayer,
      recordingRequests: Boolean(settings.recordingLinkUrl),
    },
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
  const removed = (await context.db.query(
    `WITH removed AS (
       DELETE FROM jam_issue_links WHERE jam_id = $1 AND issue_id = $2 RETURNING id, backlink_state
     ) SELECT id, backlink_state FROM removed`,
    [jamId, issueId],
  )) as Array<{ id: string; backlink_state: string }>;
  if (!removed.length) return fail(404, 'That Jam is not linked to this issue');
  // A Jam with no remaining links goes back to the inbox.
  await context.db.query(
    `UPDATE jam_items SET state = 'new', triaged_by = NULL, triaged_at = NULL
      WHERE jam_id = $1 AND NOT EXISTS (SELECT 1 FROM jam_issue_links WHERE jam_id = $1)`,
    [jamId],
  );
  await context.events.emit('jam.unlinked', { jamId, issueKey: req.params.issueKey });
  // The "Tracked in Weaver" comment stays on the Jam, so say the link is gone. Only when
  // that comment was posted, and after the response, like the resolved comment.
  const settings = readSettings(context);
  if (
    removed[0].backlink_state === 'posted' &&
    settings.postBacklinkComments &&
    settings.apiToken
  ) {
    void notifyUnlinked(context, settings, jamId, req.params.issueKey).catch((error) =>
      context.logger.warn('Could not tell Jam about an unlinked issue', {
        message: errorMessage(error),
      }),
    );
  }
  return json(200, { jamId, unlinked: true });
}

async function notifyUnlinked(
  context: PluginContext,
  settings: JamSettings,
  jamId: string,
  issueKey: string,
): Promise<void> {
  const base = webBaseUrl();
  try {
    await callJamTool(context, settings, 'createComment', {
      jamId,
      body: base
        ? `No longer tracked in Weaver as ${issueKey}: ${base}/issues/${issueKey}`
        : `No longer tracked in Weaver as ${issueKey}.`,
    });
  } catch (error) {
    await noteJamFailure(context, error);
    throw error;
  }
}

// ---------------------------------------------------------------------------------------------
// Routes: debug summary. Fetched with the plugin's token and shown to anyone who can read the
// issue, so it keeps only counts, trimmed console errors, and method, host, path, status, and
// duration of failed requests. Bodies, headers, cookies, and query strings never leave Jam.

function redactSecrets(value: string): string {
  return value
    .replace(/(bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, '$1[redacted]')
    .replace(
      /([?&](?:token|access_token|api_key|apikey|key|secret|password|auth|code|session)=)[^&\s"']+/gi,
      '$1[redacted]',
    )
    .replace(/\bjam_pat_[A-Za-z0-9_-]+/g, '[redacted]');
}

function consoleText(event: Record<string, unknown>): string | null {
  // Jam's console event fields were not observed during the spikes; these cover the
  // network event naming (console_*) and common logger shapes.
  for (const key of ['console_message', 'message', 'console_text', 'text']) {
    if (typeof event[key] === 'string' && (event[key] as string).trim())
      return event[key] as string;
  }
  const args = Array.isArray(event.console_args)
    ? event.console_args
    : Array.isArray(event.args)
      ? event.args
      : null;
  if (args) {
    const joined = args
      .filter((arg) => typeof arg === 'string')
      .join(' ')
      .trim();
    if (joined) return joined;
  }
  return null;
}

export function summarizeConsole(
  events: unknown[],
): Array<{ level: string; message: string; at: string | null }> {
  return events
    .filter(isRecord)
    .map((event) => {
      const message = consoleText(event);
      if (!message) return null;
      const level = token(event.console_level ?? event.level, 20) ?? 'error';
      return {
        level,
        message: redactSecrets(message.replace(/\s+/g, ' ').trim()).slice(0, 300),
        at: typeof event.ts === 'string' ? event.ts : null,
      };
    })
    .filter((entry): entry is { level: string; message: string; at: string | null } =>
      Boolean(entry),
    )
    .slice(0, 5);
}

export function summarizeNetwork(events: unknown[]): Array<{
  method: string;
  host: string;
  path: string;
  status: number | null;
  durationMs: number | null;
}> {
  return events
    .filter(isRecord)
    .map((event) => {
      let host = text(event.network_host, 255);
      let path = text(event.network_path, 500);
      if ((!host || !path) && typeof event.network_url === 'string') {
        try {
          const url = new URL(event.network_url);
          host = host ?? url.host;
          path = path ?? url.pathname;
        } catch {
          // Leave host and path as they are.
        }
      }
      return {
        method: token(event.network_method, 10) ?? 'GET',
        host: host ?? 'unknown host',
        // Paths can carry identifiers but never query strings or fragments.
        path: redactSecrets((path ?? '/').split(/[?#]/)[0]).slice(0, 200),
        status: typeof event.network_status === 'number' ? event.network_status : null,
        durationMs:
          typeof event.network_duration_ms === 'number'
            ? Math.round(event.network_duration_ms)
            : null,
      };
    })
    .slice(0, 5);
}

function countsFrom(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number',
    ),
  );
}

export async function getJamSummary(
  req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const settings = readSettings(context);
  if (!settings.showDebugSummary)
    return fail(404, 'Debug summaries are turned off in the plugin settings');
  const issueId = await issueIdFor(context, req.params.issueKey);
  const jamId = uuid(req.params.jamId);
  if (!issueId || !jamId) return fail(404, 'Not found');
  const linked = await context.db.query(
    'SELECT 1 FROM jam_issue_links WHERE jam_id = $1 AND issue_id = $2',
    [jamId, issueId],
  );
  if (!linked.length) return fail(404, 'That Jam is not linked to this issue');

  const [cached] = (await context.db.query(
    `SELECT summary FROM jam_summaries
      WHERE jam_id = $1 AND fetched_at > now() - make_interval(mins => $2)`,
    [jamId, SUMMARY_TTL_MINUTES],
  )) as Array<{ summary: unknown }>;
  if (cached && req.query.refresh !== 'true') return json(200, cached.summary);

  try {
    const details = await callJamJson(context, settings, 'getDetails', { jamId });
    const events = isRecord(details.eventsSummary) ? details.eventsSummary : {};
    const consoleSummary = isRecord(events.console) ? events.console : {};
    const network = isRecord(events.network) ? events.network : {};
    const httpStatus = countsFrom(network.httpStatus);
    const failedRequests = Object.entries(httpStatus)
      .filter(([status]) => Number(status) >= 400)
      .reduce((sum, [, count]) => sum + count, 0);
    const consoleLevels = countsFrom(consoleSummary.level);
    const consoleErrors =
      (consoleLevels.error ?? 0) > 0
        ? await callJamJson(context, settings, 'getConsoleLogs', {
            jamId,
            logLevel: ['error'],
            limit: 5,
          })
        : { events: [] };
    const failed =
      failedRequests > 0
        ? await callJamJson(context, settings, 'getNetworkRequests', {
            jamId,
            statusCode: ['4xx', '5xx'],
            limit: 5,
          })
        : { events: [] };
    const summary = {
      fetchedAt: new Date().toISOString(),
      console: {
        total: typeof consoleSummary.total === 'number' ? consoleSummary.total : 0,
        levels: consoleLevels,
        errors: summarizeConsole(Array.isArray(consoleErrors.events) ? consoleErrors.events : []),
      },
      network: {
        total: typeof network.total === 'number' ? network.total : 0,
        failed: failedRequests,
        failures: summarizeNetwork(Array.isArray(failed.events) ? failed.events : []),
      },
    };
    await context.db.query(
      `INSERT INTO jam_summaries (jam_id, summary, fetched_at) VALUES ($1, $2::jsonb, now())
       ON CONFLICT (jam_id) DO UPDATE SET summary = EXCLUDED.summary, fetched_at = now()`,
      [jamId, JSON.stringify(summary)],
    );
    return json(200, summary);
  } catch (error) {
    await noteJamFailure(context, error);
    return jamFailureResponse(error);
  }
}

// ---------------------------------------------------------------------------------------------
// Routes: recording requests

interface RecordingRequestRow {
  id: string;
  title: string | null;
  requested_by: string;
  expires_at: string | Date;
  revoked_at: string | Date | null;
  jams_received: number;
  created_at: string | Date;
}

function requestView(row: RecordingRequestRow, url: string | null): Record<string, unknown> {
  const expired = new Date(row.expires_at).getTime() < Date.now();
  return {
    id: row.id,
    title: row.title,
    url,
    requestedBy: row.requested_by,
    expiresAt: new Date(row.expires_at).toISOString(),
    revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
    status: row.revoked_at ? 'revoked' : expired ? 'expired' : 'active',
    jamsReceived: row.jams_received,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function listRecordingRequests(
  req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const issueKey = req.params.issueKey;
  const issueId = await issueIdFor(context, issueKey);
  if (!issueId) return fail(404, 'Issue not found');
  const settings = readSettings(context);
  const rows = (await context.db.query(
    `SELECT id, title, requested_by, expires_at, revoked_at, jams_received, created_at
       FROM jam_recording_requests WHERE issue_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [issueId],
  )) as RecordingRequestRow[];
  const secret = rows.length && settings.recordingLinkUrl ? await referenceSecret(context) : null;
  return json(200, {
    enabled: Boolean(settings.recordingLinkUrl),
    items: rows.map((row) => {
      const active = !row.revoked_at && new Date(row.expires_at).getTime() >= Date.now();
      const url =
        active && secret
          ? recordingUrl(
              settings.recordingLinkUrl,
              requestReference(issueKey, row.id, signRequest(secret, context.tenant.id, row.id)),
              row.title,
            )
          : null;
      return requestView(row, url);
    }),
  });
}

export async function createRecordingRequest(
  req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const user = context.user;
  if (!user) return fail(401, 'Sign in to request recordings');
  const settings = readSettings(context);
  if (!settings.recordingLinkUrl) {
    return fail(
      400,
      'An administrator needs to add a reusable Jam recording link in the plugin settings',
    );
  }
  const issueKey = req.params.issueKey;
  const issueId = await issueIdFor(context, issueKey);
  if (!issueId) return fail(404, 'Issue not found');
  const body = isRecord(req.body) ? req.body : {};
  const title =
    body.title === undefined || body.title === ''
      ? `Recording for ${issueKey}`
      : text(body.title, 201);
  if (!title || title.length > 200) return fail(400, 'The title must be 1 to 200 characters');
  const days = body.expiresInDays === undefined ? 30 : Number(body.expiresInDays);
  if (!Number.isInteger(days) || days < 1 || days > 90)
    return fail(400, 'Expiry must be 1 to 90 days');

  const [row] = (await context.db.query(
    `INSERT INTO jam_recording_requests (issue_id, requested_by, mode, title, expires_at)
     VALUES ($1, $2, 'url_parameter', $3, now() + make_interval(days => $4))
     RETURNING id, title, requested_by, expires_at, revoked_at, jams_received, created_at`,
    [issueId, user.id, title, days],
  )) as RecordingRequestRow[];
  const signature = signRequest(await referenceSecret(context), context.tenant.id, row.id);
  const url = recordingUrl(
    settings.recordingLinkUrl,
    requestReference(issueKey, row.id, signature),
    title,
  );
  return json(201, requestView(row, url));
}

export async function revokeRecordingRequest(
  req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const issueId = await issueIdFor(context, req.params.issueKey);
  const requestId = uuid(req.params.requestId);
  if (!issueId || !requestId) return fail(404, 'Not found');
  const rows = await context.db.query(
    `WITH revoked AS (
       UPDATE jam_recording_requests SET revoked_at = now()
        WHERE id = $1 AND issue_id = $2 AND revoked_at IS NULL
        RETURNING id
     ) SELECT id FROM revoked`,
    [requestId, issueId],
  );
  return rows.length
    ? json(200, { id: requestId, status: 'revoked' })
    : fail(404, 'No active request with that ID on this issue');
}

// ---------------------------------------------------------------------------------------------
// Routes: routing rules (jam.admin)

const HOST_PATTERN = /^(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i;
const MAX_RULE_HOSTS = 20;

/** Accepts an array or one string separated by commas or new lines. */
function parseHosts(value: unknown): string[] | null | { error: string } {
  if (value === undefined || value === null || value === '') return null;
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,\n]+/)
      : null;
  if (!raw || raw.some((host) => typeof host !== 'string')) {
    return { error: 'Page hosts must be text, separated by commas' };
  }
  const hosts = [
    ...new Set((raw as string[]).map((host) => host.trim().toLowerCase()).filter(Boolean)),
  ];
  const invalid = hosts.find((host) => host.length > 253 || !HOST_PATTERN.test(host));
  if (invalid) {
    const shown = invalid.length > 60 ? `${invalid.slice(0, 60)}...` : invalid;
    return {
      error: `"${shown}" is not a host name. Use names such as shop.example.com or *.example.com`,
    };
  }
  if (hosts.length > MAX_RULE_HOSTS) {
    return { error: `A rule can match at most ${MAX_RULE_HOSTS} page hosts` };
  }
  return hosts.length ? hosts : null;
}

const RULE_MATCHERS: Array<{
  key: 'authorEmailDomain' | 'recordingLinkPublicId' | 'origin' | 'titlePrefix' | 'folder';
  max: number;
  pattern?: RegExp;
}> = [
  {
    key: 'authorEmailDomain',
    max: 253,
    pattern: /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i,
  },
  { key: 'recordingLinkPublicId', max: 64, pattern: /^[A-Za-z0-9_-]+$/ },
  { key: 'origin', max: 40, pattern: /^[a-z_]+$/ },
  { key: 'titlePrefix', max: 100 },
  { key: 'folder', max: 120 },
];

interface RuleInput {
  name?: string;
  enabled?: boolean;
  match?: RuleMatch;
  action?: 'create' | 'inbox';
  projectKey?: string;
  issueTypeId?: string | null;
  priority?: Priority | null;
  labels?: string[];
  assigneeId?: string | null;
  hourlyLimit?: number | null;
}

function parseRuleInput(value: unknown, partial: boolean): RuleInput | { error: string } {
  if (!isRecord(value)) return { error: 'A JSON body is required' };
  const input: RuleInput = {};
  if (value.name !== undefined || !partial) {
    const name = text(value.name, 121);
    if (!name || name.length > 120) return { error: 'The rule name must be 1 to 120 characters' };
    input.name = name;
  }
  if (value.enabled !== undefined) {
    if (typeof value.enabled !== 'boolean') return { error: 'enabled must be true or false' };
    input.enabled = value.enabled;
  }
  if (value.match !== undefined || !partial) {
    if (!isRecord(value.match)) return { error: 'Add at least one matcher' };
    const match: RuleMatch = {};
    const hosts = parseHosts(value.match.urlHosts ?? value.match.urlHost);
    if (hosts && 'error' in hosts) return hosts;
    if (hosts) match.urlHosts = hosts;
    const rawPath = value.match.pathPrefix;
    if (rawPath !== undefined && rawPath !== null && rawPath !== '') {
      const path = text(rawPath, 201);
      if (!path || path.length > 200 || !path.startsWith('/') || /[\s?#]/.test(path)) {
        return {
          error: 'The path must start with / and have no spaces, query string, or fragment',
        };
      }
      match.pathPrefix = path;
    }
    for (const { key, max, pattern } of RULE_MATCHERS) {
      const raw = value.match[key];
      if (raw === undefined || raw === null || raw === '') continue;
      const matcher = text(raw, max + 1);
      if (!matcher || matcher.length > max || (pattern && !pattern.test(matcher)))
        return { error: `Invalid ${key}` };
      match[key] = key === 'authorEmailDomain' ? matcher.toLowerCase() : matcher;
    }
    if (!Object.keys(match).length) return { error: 'Add at least one matcher' };
    input.match = match;
  }
  if (value.action !== undefined || !partial) {
    if (value.action !== 'create' && value.action !== 'inbox')
      return { error: 'The action must be create or inbox' };
    input.action = value.action;
  }
  if (value.projectKey !== undefined || !partial) {
    const projectKey = parseProjectKey(value.projectKey);
    if (!projectKey) return { error: 'Choose a project' };
    input.projectKey = projectKey;
  }
  const fields = parseIssueFields({
    priority: value.priority,
    issueTypeId: value.issueTypeId,
    assigneeId: value.assigneeId,
    labels: value.labels,
  });
  if ('error' in fields) return fields;
  if (value.priority !== undefined) input.priority = fields.priority ?? null;
  if (value.issueTypeId !== undefined) input.issueTypeId = fields.issueTypeId ?? null;
  if (value.assigneeId !== undefined) input.assigneeId = fields.assigneeId ?? null;
  if (value.labels !== undefined) input.labels = fields.labels ?? [];
  if (value.hourlyLimit !== undefined) {
    if (value.hourlyLimit === null || value.hourlyLimit === '') input.hourlyLimit = null;
    else {
      const limit = Number(value.hourlyLimit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 500)
        return { error: 'The hourly limit must be 1 to 500' };
      input.hourlyLimit = limit;
    }
  }
  return input;
}

function toRuleView(row: RuleRow) {
  return {
    id: row.id,
    position: row.position,
    name: row.name,
    enabled: row.enabled,
    match: row.match,
    action: row.action,
    projectKey: row.project_key,
    projectName: row.project_name,
    issueTypeId: row.issue_type_id,
    priority: row.priority,
    labels: row.labels ?? [],
    assigneeId: row.assignee_id,
    hourlyLimit: row.hourly_limit,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

async function findRule(context: PluginContext, ruleId: string): Promise<RuleRow | null> {
  const rows = (await context.db.query(
    `SELECT ${RULE_COLUMNS} FROM jam_routing_rules r JOIN projects p ON p.id = r.project_id WHERE r.id = $1`,
    [ruleId],
  )) as RuleRow[];
  return rows[0] ?? null;
}

/** A rule creates issues as its author when the Jam author cannot, so the author needs write access. */
async function projectIdForRule(context: PluginContext, projectKey: string): Promise<string> {
  await context.api.projects.assertAccess(projectKey, 'write');
  const project = await context.api.projects.get(projectKey);
  return (project as { id: string }).id;
}

function hostsOf(match: RuleMatch): string[] {
  return (match.urlHosts ?? (match.urlHost ? [match.urlHost] : [])).map((host) =>
    host.toLowerCase(),
  );
}

const pathKey = (match: RuleMatch) => (match.pathPrefix ?? '').toLowerCase().replace(/\/+$/, '');

/**
 * A host routes to one project. Refuse a host that another project's rule already lists with the
 * same path prefix; different paths may split one host across projects. Wildcards are compared
 * as written, so *.client.com and shop.client.com do not conflict and rule order decides.
 */
async function hostConflict(
  context: PluginContext,
  ruleId: string | null,
  match: RuleMatch,
  projectId: string,
): Promise<string | null> {
  const hosts = hostsOf(match);
  if (!hosts.length) return null;
  const others = (await context.db.query(
    `SELECT r.name, r.match, p.key AS project_key FROM jam_routing_rules r JOIN projects p ON p.id = r.project_id
      WHERE ($1::uuid IS NULL OR r.id <> $1) AND r.project_id <> $2`,
    [ruleId, projectId],
  )) as Array<{ name: string; match: RuleMatch; project_key: string }>;
  for (const other of others) {
    if (pathKey(other.match) !== pathKey(match)) continue;
    const shared = hostsOf(other.match).find((host) => hosts.includes(host));
    if (shared) {
      return `${shared} already routes to ${other.project_key} in the rule "${other.name}". A host belongs to one project; use a path to split it.`;
    }
  }
  return null;
}

export async function listRules(
  _req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const rows = (await context.db.query(
    `SELECT ${RULE_COLUMNS} FROM jam_routing_rules r JOIN projects p ON p.id = r.project_id
      ORDER BY r.position, r.created_at`,
  )) as RuleRow[];
  return json(200, { items: rows.map(toRuleView) });
}

export async function createRule(
  req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const user = context.user;
  if (!user) return fail(401, 'Sign in to manage rules');
  const input = parseRuleInput(req.body, false);
  if ('error' in input) return fail(400, input.error);
  const projectId = await projectIdForRule(context, input.projectKey!);
  const conflict = await hostConflict(context, null, input.match!, projectId);
  if (conflict) return fail(409, conflict);
  const [row] = (await context.db.query(
    `INSERT INTO jam_routing_rules
       (position, name, enabled, match, action, project_id, issue_type_id, priority, labels, assignee_id, hourly_limit, created_by)
     VALUES ((SELECT COALESCE(max(position), 0) + 1 FROM jam_routing_rules), $1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [
      input.name,
      input.enabled ?? true,
      JSON.stringify(input.match),
      input.action,
      projectId,
      input.issueTypeId ?? null,
      input.priority ?? null,
      input.labels ?? [],
      input.assigneeId ?? null,
      input.hourlyLimit ?? null,
      user.id,
    ],
  )) as Array<{ id: string }>;
  return json(201, toRuleView((await findRule(context, row.id))!));
}

export async function updateRule(
  req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const user = context.user;
  if (!user) return fail(401, 'Sign in to manage rules');
  const ruleId = uuid(req.params.ruleId);
  const existing = ruleId ? await findRule(context, ruleId) : null;
  if (!ruleId || !existing) return fail(404, 'Rule not found');
  const input = parseRuleInput(req.body, true);
  if ('error' in input) return fail(400, input.error);
  // The editor becomes the rule's author (below), so they need write access to its project.
  let projectId = existing.project_id;
  if (input.projectKey === undefined) {
    await context.api.projects.assertAccess(existing.project_key, 'write');
  } else {
    projectId = await projectIdForRule(context, input.projectKey);
  }
  const conflict = await hostConflict(context, ruleId, input.match ?? existing.match, projectId);
  if (conflict) return fail(409, conflict);
  const sets: string[] = [];
  const params: unknown[] = [ruleId];
  const set = (column: string, value: unknown, cast = '') => {
    params.push(value);
    sets.push(`${column} = $${params.length}${cast}`);
  };
  if (input.name !== undefined) set('name', input.name);
  if (input.enabled !== undefined) set('enabled', input.enabled);
  if (input.match !== undefined) set('match', JSON.stringify(input.match), '::jsonb');
  if (input.action !== undefined) set('action', input.action);
  if (input.projectKey !== undefined) set('project_id', projectId);
  if (input.issueTypeId !== undefined) set('issue_type_id', input.issueTypeId);
  if (input.priority !== undefined) set('priority', input.priority);
  if (input.labels !== undefined) set('labels', input.labels);
  if (input.assigneeId !== undefined) set('assignee_id', input.assigneeId);
  if (input.hourlyLimit !== undefined) set('hourly_limit', input.hourlyLimit);
  // Whoever last changes a rule is who it creates issues as, so their access is what counts.
  set('created_by', user.id);
  await context.db.query(
    `UPDATE jam_routing_rules SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`,
    params,
  );
  return json(200, toRuleView((await findRule(context, ruleId))!));
}

export async function deleteRule(
  req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const ruleId = uuid(req.params.ruleId);
  if (!ruleId) return fail(404, 'Rule not found');
  const rows = await context.db.query(
    `WITH removed AS (DELETE FROM jam_routing_rules WHERE id = $1 RETURNING id) SELECT id FROM removed`,
    [ruleId],
  );
  return rows.length ? json(200, { id: ruleId, deleted: true }) : fail(404, 'Rule not found');
}

export async function reorderRules(
  req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const ids = isRecord(req.body) && Array.isArray(req.body.ids) ? req.body.ids.map(uuid) : null;
  if (!ids || ids.some((id) => !id) || new Set(ids).size !== ids.length)
    return fail(400, 'Send the rule IDs in order');
  const existing = (await context.db.query('SELECT id FROM jam_routing_rules')) as Array<{
    id: string;
  }>;
  if (existing.length !== ids.length || existing.some((row) => !ids.includes(row.id))) {
    return fail(400, 'Send every rule ID exactly once');
  }
  await context.db.query(
    `UPDATE jam_routing_rules r SET position = ordered.position
       FROM unnest($1::uuid[]) WITH ORDINALITY AS ordered(id, position)
      WHERE r.id = ordered.id`,
    [ids],
  );
  return listRules(req, context);
}

// ---------------------------------------------------------------------------------------------
// Events: tell the Jam when its issue is resolved (setting notifyJamOnResolve)

export async function onEvent(event: string, data: unknown, context: PluginContext): Promise<void> {
  if (event !== 'issue.status_changed' || !isRecord(data)) return;
  const settings = readSettings(context);
  if (!settings.notifyJamOnResolve || !settings.apiToken) return;
  const issueKey = text(data.issueKey, 64);
  const toStatus = uuid(data.toStatus);
  if (!issueKey || !toStatus) return;
  const [status] = (await context.db.query(
    'SELECT name, category FROM workflow_statuses WHERE id = $1',
    [toStatus],
  )) as Array<{ name: string; category: string }>;
  if (status?.category !== 'done') return;
  const links = (await context.db.query(
    `SELECT l.jam_id FROM jam_issue_links l JOIN issues i ON i.id = l.issue_id WHERE i.key = $1`,
    [issueKey],
  )) as Array<{ jam_id: string }>;
  if (!links.length) return;
  // Events run inside the request that changed the status, so the Jam calls happen afterwards
  // instead of holding up the person who resolved the issue.
  void notifyResolved(
    context,
    settings,
    issueKey,
    status.name,
    links.map((link) => link.jam_id),
  ).catch((error) =>
    context.logger.warn('Could not tell Jam about a resolved issue', {
      message: errorMessage(error),
    }),
  );
}

async function notifyResolved(
  context: PluginContext,
  settings: JamSettings,
  issueKey: string,
  statusName: string,
  jamIds: string[],
): Promise<void> {
  const base = webBaseUrl();
  for (const jamId of jamIds) {
    let mention = '';
    try {
      const details = await callJamJson(context, settings, 'getDetails', { jamId });
      const author = isRecord(details.author) ? details.author : null;
      const authorId = author ? uuid(author.id) : null;
      const name = author ? (text(author.name, 100) ?? 'the reporter') : null;
      // Jam's mention syntax; it notifies the person who captured the Jam.
      if (authorId && name) mention = ` @[${name.replace(/[[\]]/g, '')}](user:${authorId})`;
    } catch (error) {
      await noteJamFailure(context, error);
      if (jamKindOf(error) === 'unauthorized') return;
    }
    const link = base ? `: ${base}/issues/${issueKey}` : '.';
    await callJamTool(context, settings, 'createComment', {
      jamId,
      body: `${issueKey} was resolved in Weaver (${statusName})${link}${mention}`,
    });
  }
}
