import type { PluginContext, PluginRequest, PluginResponse, PluginTimeEntry } from '@weaver/sdk';

declare const process: { env: Record<string, string | undefined> };

type Row = Record<string, any>;

interface SyntheticDraftFixture {
  sourceReference: string;
  localDate: string;
  startedAt: string;
  endedAt: string;
  proposedMinutes: number;
  description: string;
  confidence: number;
  assignmentMethod: string;
  assignmentReasons: string[];
  assignmentAlternatives?: AssignmentAlternative[];
  rulesetVersion?: string;
  evidenceDigest: string;
}

interface DeviceDraft extends SyntheticDraftFixture {
  issueKey?: string;
  correctionContextDigest?: string;
  assignmentAlternatives: AssignmentAlternative[];
  rulesetVersion: string;
}

interface AssignmentAlternative {
  issueKey: string;
  confidence: number;
  reasons: string[];
}

const DEVICE_SCOPES = [
  'automatic-time:candidates:read',
  'automatic-time:drafts:read',
  'automatic-time:drafts:write',
  'automatic-time:rules:read',
  'automatic-time:device:heartbeat',
];

const DEVICE_DRAFT_FIELDS = new Set([
  'sourceReference',
  'localDate',
  'startedAt',
  'endedAt',
  'proposedMinutes',
  'description',
  'confidence',
  'assignmentMethod',
  'assignmentReasons',
  'assignmentAlternatives',
  'rulesetVersion',
  'evidenceDigest',
  'correctionContextDigest',
  'issueKey',
]);

const PRIVATE_CONTEXT_DIGEST = /^sha256:[0-9a-f]{64}$/;

function bytesToHex(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomSecret(byteCount: number): string {
  const bytes = new Uint8Array(byteCount);
  globalThis.crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

async function hashSecret(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToHex(digest);
}

function mapPairingRequest(row: Row): Record<string, unknown> {
  return {
    userCode: row.user_code,
    displayName: row.display_name,
    platform: row.platform,
    companionVersion: row.companion_version,
    requestedScopes: row.requested_scopes,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    approvedAt: row.approved_at,
  };
}

function mapDevice(row: Row): Record<string, unknown> {
  const expired = row.expires_at && new Date(row.expires_at).valueOf() <= Date.now();
  return {
    id: row.id,
    displayName: row.display_name,
    platform: row.platform,
    companionVersion: row.companion_version,
    scopes: row.scopes,
    status: row.revoked_at ? 'revoked' : expired ? 'expired' : 'active',
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
    expiresAt: row.expires_at,
  };
}

function requireUser(context: PluginContext): string | null {
  return context.user?.id ?? null;
}

function isLocalDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(new Date(value).valueOf());
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function bodyObject(req: PluginRequest): Record<string, unknown> {
  return req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? (req.body as Record<string, unknown>)
    : {};
}

function rowsFromQuery(result: unknown[]): Row[] {
  if (result.length === 2 && Array.isArray(result[0]) && typeof result[1] === 'number') {
    return result[0] as Row[];
  }
  return result as Row[];
}

function normalizeLocalDate(value: unknown): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function mapDraft(row: Row): Record<string, unknown> {
  const sourceReference = String(row.source_reference);
  const draftType = sourceReference.startsWith('manual:offline:')
    ? 'offline'
    : sourceReference.startsWith('manual:merge:')
      ? 'merged'
      : sourceReference.startsWith('manual:split:')
        ? 'split'
        : 'captured';
  return {
    id: row.id,
    userId: row.user_id,
    sourceReference,
    draftType,
    localDate: normalizeLocalDate(row.local_date),
    startedAt: row.started_at,
    endedAt: row.ended_at,
    proposedMinutes: row.proposed_minutes,
    description: row.description,
    issueId: row.issue_id,
    issueKey: row.issue_key,
    confidence: Number(row.confidence),
    assignmentMethod: row.assignment_method,
    assignmentReasons: row.assignment_reasons,
    assignmentAlternatives: row.assignment_alternatives,
    rulesetVersion: row.ruleset_version,
    correctionContextDigest: row.correction_context_digest,
    suggestedIssueKey: row.suggested_issue_key,
    status: row.status,
    evidenceDigest: row.evidence_digest,
    releaseBatchId: row.release_batch_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    releasedAt: row.released_at,
  };
}

function mapCorrectionMemory(row: Row): Record<string, unknown> {
  const normalizedFeatures = Object.fromEntries(
    Object.entries(row.normalized_features ?? {}).filter((entry) => typeof entry[1] === 'string'),
  );
  return {
    id: row.id,
    memoryType: row.memory_type,
    normalizedFeatures,
    targetProjectKey: row.target_project_key,
    targetIssueKey: row.target_issue_key,
    weight: Number(row.weight),
    positiveCount: row.positive_count,
    negativeCount: row.negative_count,
    enabled: Boolean(row.enabled),
    lastAppliedAt: row.last_applied_at,
    explanation: row.explanation,
    updatedAt: row.updated_at,
  };
}

function mapReleaseBatch(row: Row): Record<string, unknown> {
  return {
    id: row.id,
    localDate: normalizeLocalDate(row.local_date),
    idempotencyKey: row.idempotency_key,
    status: row.status,
    reportedTotalMinutes: row.reported_total_minutes,
    officialTimeEntryIds: row.official_time_entry_ids,
    createdAt: row.created_at,
    releasedAt: row.released_at,
  };
}

interface ReleasePreviewEntry {
  draftId: string;
  issueKey: string;
  sourceReference: string;
  minutes: number;
  proposedMinutes: number;
  description: string;
  startedAt: string;
  endedAt: string;
}

function distributeReportedMinutes(drafts: Row[], reportedTotalMinutes: number): number[] {
  const proposed = drafts.map((draft) => Number(draft.proposed_minutes));
  const proposedTotal = proposed.reduce((total, minutes) => total + minutes, 0);
  if (reportedTotalMinutes === proposedTotal) return proposed;

  const distributable = reportedTotalMinutes - drafts.length;
  const quotas = proposed.map((minutes) => (distributable * minutes) / proposedTotal);
  const allocations = quotas.map((quota) => 1 + Math.floor(quota));
  let remainder = reportedTotalMinutes - allocations.reduce((total, minutes) => total + minutes, 0);
  const order = quotas
    .map((quota, index) => ({ index, fraction: quota - Math.floor(quota) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  for (let index = 0; remainder > 0; index = (index + 1) % order.length) {
    allocations[order[index].index] += 1;
    remainder -= 1;
  }
  return allocations;
}

function buildReleasePreview(
  drafts: Row[],
  hiddenDrafts: Row[],
  reportedTotalMinutes: number,
): {
  capturedTotalMinutes: number;
  hiddenTotalMinutes: number;
  proposedTotalMinutes: number;
  reportedTotalMinutes: number;
  manualAdjustmentMinutes: number;
  entries: ReleasePreviewEntry[];
} {
  const proposedTotalMinutes = drafts.reduce(
    (total, draft) => total + Number(draft.proposed_minutes),
    0,
  );
  const hiddenTotalMinutes = hiddenDrafts.reduce(
    (total, draft) => total + Number(draft.proposed_minutes),
    0,
  );
  const allocations = distributeReportedMinutes(drafts, reportedTotalMinutes);
  return {
    capturedTotalMinutes: proposedTotalMinutes + hiddenTotalMinutes,
    hiddenTotalMinutes,
    proposedTotalMinutes,
    reportedTotalMinutes,
    manualAdjustmentMinutes: reportedTotalMinutes - proposedTotalMinutes,
    entries: drafts.map((draft, index) => ({
      draftId: draft.id,
      issueKey: draft.issue_key,
      sourceReference: draft.source_reference,
      minutes: allocations[index],
      proposedMinutes: Number(draft.proposed_minutes),
      description: draft.description,
      startedAt: new Date(draft.started_at).toISOString(),
      endedAt: new Date(draft.ended_at).toISOString(),
    })),
  };
}

function validateReportedTotal(value: unknown, draftCount: number): value is number {
  return Number.isInteger(value) && Number(value) >= draftCount && Number(value) <= 1440;
}

function validateFixture(value: unknown): value is SyntheticDraftFixture {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const fixture = value as Record<string, unknown>;
  return (
    typeof fixture.sourceReference === 'string' &&
    fixture.sourceReference.length > 0 &&
    fixture.sourceReference.length <= 200 &&
    isLocalDate(fixture.localDate) &&
    isTimestamp(fixture.startedAt) &&
    isTimestamp(fixture.endedAt) &&
    new Date(fixture.endedAt).valueOf() > new Date(fixture.startedAt).valueOf() &&
    Number.isInteger(fixture.proposedMinutes) &&
    Number(fixture.proposedMinutes) > 0 &&
    Number(fixture.proposedMinutes) <= 1440 &&
    typeof fixture.description === 'string' &&
    fixture.description.length <= 500 &&
    typeof fixture.confidence === 'number' &&
    fixture.confidence >= 0 &&
    fixture.confidence <= 1 &&
    typeof fixture.assignmentMethod === 'string' &&
    Array.isArray(fixture.assignmentReasons) &&
    fixture.assignmentReasons.length <= 10 &&
    fixture.assignmentReasons.every(
      (reason) => typeof reason === 'string' && reason.length <= 500,
    ) &&
    (fixture.assignmentAlternatives === undefined ||
      validateAssignmentAlternatives(fixture.assignmentAlternatives)) &&
    (fixture.rulesetVersion === undefined ||
      (typeof fixture.rulesetVersion === 'string' &&
        fixture.rulesetVersion.length > 0 &&
        fixture.rulesetVersion.length <= 100)) &&
    typeof fixture.evidenceDigest === 'string' &&
    fixture.evidenceDigest.length > 0 &&
    fixture.evidenceDigest.length <= 200
  );
}

function validateAssignmentAlternatives(value: unknown): value is AssignmentAlternative[] {
  if (!Array.isArray(value) || value.length > 3) return false;
  const keys = new Set<string>();
  return value.every((alternative) => {
    if (!alternative || typeof alternative !== 'object' || Array.isArray(alternative)) return false;
    const candidate = alternative as Record<string, unknown>;
    if (
      Object.keys(candidate).some((key) => !['issueKey', 'confidence', 'reasons'].includes(key)) ||
      typeof candidate.issueKey !== 'string' ||
      !/^[A-Z][A-Z0-9]+-[0-9]+$/.test(candidate.issueKey) ||
      candidate.issueKey.length > 100 ||
      keys.has(candidate.issueKey) ||
      typeof candidate.confidence !== 'number' ||
      candidate.confidence < 0 ||
      candidate.confidence > 1 ||
      !Array.isArray(candidate.reasons) ||
      candidate.reasons.length > 10 ||
      !candidate.reasons.every((reason) => typeof reason === 'string' && reason.length <= 500)
    ) {
      return false;
    }
    keys.add(candidate.issueKey);
    return true;
  });
}

function validateDeviceDraft(value: unknown): value is DeviceDraft {
  if (!validateFixture(value)) return false;
  const draft = value as unknown as Record<string, unknown>;
  return (
    Object.keys(draft).every((key) => DEVICE_DRAFT_FIELDS.has(key)) &&
    validateAssignmentAlternatives(draft.assignmentAlternatives) &&
    typeof draft.rulesetVersion === 'string' &&
    draft.rulesetVersion.length > 0 &&
    draft.rulesetVersion.length <= 100 &&
    !draft.assignmentAlternatives.some((alternative) => alternative.issueKey === draft.issueKey) &&
    (draft.correctionContextDigest === undefined ||
      (typeof draft.correctionContextDigest === 'string' &&
        PRIVATE_CONTEXT_DIGEST.test(draft.correctionContextDigest))) &&
    (draft.issueKey === undefined ||
      (typeof draft.issueKey === 'string' &&
        /^[A-Z][A-Z0-9]+-[0-9]+$/.test(draft.issueKey) &&
        draft.issueKey.length <= 100))
  );
}

export async function requestPairing(
  req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const body = bodyObject(req);
  if (
    typeof body.displayName !== 'string' ||
    !body.displayName.trim() ||
    body.displayName.length > 200 ||
    body.platform !== 'macos' ||
    typeof body.companionVersion !== 'string' ||
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)/.test(body.companionVersion) ||
    body.companionVersion.length > 50
  ) {
    return { status: 400, body: { message: 'Valid macOS companion details are required' } };
  }

  const pairingCode = randomSecret(32);
  const compactUserCode = randomSecret(4).toUpperCase();
  const userCode = `${compactUserCode.slice(0, 4)}-${compactUserCode.slice(4)}`;
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  await context.db.query(
    `INSERT INTO automatic_time_pairing_requests (
       code_hash, user_code, display_name, platform, companion_version,
       requested_scopes, expires_at
     ) VALUES ($1, $2, $3, 'macos', $4, $5::jsonb, $6::timestamptz)`,
    [
      await hashSecret(pairingCode),
      userCode,
      body.displayName.trim(),
      body.companionVersion,
      JSON.stringify(DEVICE_SCOPES),
      expiresAt,
    ],
  );

  return {
    status: 201,
    body: {
      pairingCode,
      userCode,
      verificationUri: `/apps/automatic-time/settings?pairing=${encodeURIComponent(userCode)}`,
      expiresAt,
      intervalSeconds: 2,
    },
  };
}

export async function getPairingRequest(
  req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const userId = requireUser(context);
  if (!userId) return { status: 401, body: { message: 'Authentication required' } };
  const userCode = req.params.userCode?.toUpperCase();
  const rows = rowsFromQuery(
    await context.db.query(`SELECT * FROM automatic_time_pairing_requests WHERE user_code = $1`, [
      userCode,
    ]),
  );
  const pairing = rows[0];
  if (!pairing) return { status: 404, body: { message: 'Pairing request not found' } };
  if (new Date(pairing.expires_at).valueOf() <= Date.now() && pairing.status === 'pending') {
    await context.db.query(
      `UPDATE automatic_time_pairing_requests SET status = 'expired' WHERE id = $1::uuid`,
      [pairing.id],
    );
    return { status: 410, body: { message: 'Pairing request expired' } };
  }
  return { status: 200, body: mapPairingRequest(pairing) };
}

export async function approvePairingRequest(
  req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const userId = requireUser(context);
  if (!userId) return { status: 401, body: { message: 'Authentication required' } };
  const userCode = req.params.userCode?.toUpperCase();
  const rows = rowsFromQuery(
    await context.db.query(
      `UPDATE automatic_time_pairing_requests
          SET user_id = $1::uuid,
              status = 'approved',
              approved_at = now()
        WHERE user_code = $2
          AND status = 'pending'
          AND expires_at > now()
      RETURNING *`,
      [userId, userCode],
    ),
  );
  if (rows[0]) return { status: 200, body: mapPairingRequest(rows[0]) };

  const existing = rowsFromQuery(
    await context.db.query(`SELECT * FROM automatic_time_pairing_requests WHERE user_code = $1`, [
      userCode,
    ]),
  )[0];
  if (!existing) return { status: 404, body: { message: 'Pairing request not found' } };
  if (new Date(existing.expires_at).valueOf() <= Date.now() || existing.status === 'expired') {
    await context.db.query(
      `UPDATE automatic_time_pairing_requests
          SET status = 'expired'
        WHERE id = $1::uuid AND status = 'pending'`,
      [existing.id],
    );
    return { status: 410, body: { message: 'Pairing request expired' } };
  }
  return { status: 409, body: { message: 'Pairing request is no longer pending' } };
}

export async function exchangePairingCode(
  req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const pairingCode = bodyObject(req).pairingCode;
  if (typeof pairingCode !== 'string' || pairingCode.length < 32 || pairingCode.length > 100) {
    return { status: 400, body: { message: 'pairingCode is required' } };
  }
  const codeHash = await hashSecret(pairingCode);
  const pairings = rowsFromQuery(
    await context.db.query(
      `UPDATE automatic_time_pairing_requests
          SET exchange_attempts = exchange_attempts + 1
        WHERE code_hash = $1
      RETURNING *`,
      [codeHash],
    ),
  );
  const pairing = pairings[0];
  if (!pairing) return { status: 401, body: { message: 'Invalid pairing code' } };
  if (pairing.exchange_attempts > 120) {
    return { status: 429, body: { message: 'Pairing exchange limit exceeded' } };
  }
  if (new Date(pairing.expires_at).valueOf() <= Date.now()) {
    await context.db.query(
      `UPDATE automatic_time_pairing_requests
          SET status = 'expired'
        WHERE id = $1::uuid AND status IN ('pending', 'approved')`,
      [pairing.id],
    );
    return { status: 410, body: { message: 'Pairing request expired' } };
  }
  if (pairing.status === 'pending') {
    return { status: 202, body: { status: 'pending', expiresAt: pairing.expires_at } };
  }
  if (pairing.status !== 'approved' || !pairing.user_id) {
    return { status: 409, body: { message: 'Pairing code has already been used' } };
  }

  const deviceToken = randomSecret(32);
  const tokenHash = await hashSecret(deviceToken);
  const deviceId = globalThis.crypto.randomUUID();
  const credentialExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60_000).toISOString();
  const devices = rowsFromQuery(
    await context.db.query(
      `WITH exchanged AS (
       UPDATE automatic_time_pairing_requests
          SET status = 'exchanged', exchanged_at = now(), device_id = $4::uuid
        WHERE id = $1::uuid AND status = 'approved' AND expires_at > now()
      RETURNING *
     ), paired_device AS (
       INSERT INTO automatic_time_devices (
         id, user_id, display_name, platform, companion_version, token_hash, scopes, expires_at
       )
       SELECT $4::uuid, user_id, display_name, platform, companion_version,
              $2, requested_scopes, $3::timestamptz
         FROM exchanged
      RETURNING *
     )
     SELECT * FROM paired_device`,
      [pairing.id, tokenHash, credentialExpiresAt, deviceId],
    ),
  );
  const device = devices[0];
  if (!device) return { status: 409, body: { message: 'Pairing code has already been used' } };

  await context.events.emit('automatic-time.device_paired', {
    deviceId: device.id,
    userId: device.user_id,
    companionVersion: device.companion_version,
  });
  return {
    status: 201,
    body: {
      deviceId: device.id,
      deviceToken,
      scopes: device.scopes,
      expiresAt: device.expires_at,
    },
  };
}

export async function authenticateDeviceCredential(
  req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const authorization = req.headers.authorization;
  const token =
    typeof authorization === 'string' ? authorization.match(/^Bearer (.+)$/i)?.[1] : null;
  if (!token) return { status: 401, body: { message: 'Device credential required' } };
  const reportedVersion = req.headers['x-companion-version'];
  const companionVersion =
    typeof reportedVersion === 'string' &&
    reportedVersion.length <= 50 &&
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)/.test(reportedVersion)
      ? reportedVersion
      : null;
  const rows = rowsFromQuery(
    await context.db.query(
      `UPDATE automatic_time_devices
          SET last_seen_at = now(),
              companion_version = COALESCE($2, companion_version)
        WHERE token_hash = $1
          AND revoked_at IS NULL
          AND (expires_at IS NULL OR expires_at > now())
      RETURNING id, user_id, scopes`,
      [await hashSecret(token), companionVersion],
    ),
  );
  const device = rows[0];
  if (!device) return { status: 401, body: { message: 'Device credential is invalid' } };
  return {
    status: 200,
    body: { deviceId: device.id, userId: device.user_id, scopes: device.scopes },
  };
}

export async function getDeviceStatus(
  req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  if (req.auth?.type !== 'device') {
    return { status: 401, body: { message: 'Device authentication required' } };
  }
  const userId = requireUser(context);
  const rows = rowsFromQuery(
    await context.db.query(
      `SELECT * FROM automatic_time_devices WHERE id = $1::uuid AND user_id = $2::uuid`,
      [req.auth.deviceId, userId],
    ),
  );
  if (!rows[0]) return { status: 401, body: { message: 'Device credential is invalid' } };
  return { status: 200, body: { deviceId: rows[0].id, ...mapDevice(rows[0]) } };
}

export async function listDevices(
  _req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const userId = requireUser(context);
  if (!userId) return { status: 401, body: { message: 'Authentication required' } };
  const rows = rowsFromQuery(
    await context.db.query(
      `SELECT * FROM automatic_time_devices WHERE user_id = $1::uuid ORDER BY created_at DESC`,
      [userId],
    ),
  );
  return { status: 200, body: rows.map(mapDevice) };
}

export async function listReleasedDaysForRetention(
  req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  if (req.auth?.type !== 'device') {
    return { status: 401, body: { message: 'Device authentication required' } };
  }
  const userId = requireUser(context);
  const rows = rowsFromQuery(
    await context.db.query(
      `SELECT local_date::text AS local_date, released_at
         FROM automatic_time_release_batches
        WHERE user_id = $1::uuid
          AND status = 'released'
          AND released_at IS NOT NULL
        ORDER BY released_at DESC
        LIMIT 100`,
      [userId],
    ),
  );
  return {
    status: 200,
    body: rows.map((row) => ({
      localDate: row.local_date,
      releasedAt: new Date(row.released_at).toISOString(),
    })),
  };
}

export async function revokeDevice(
  req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const userId = requireUser(context);
  if (!userId) return { status: 401, body: { message: 'Authentication required' } };
  const rows = rowsFromQuery(
    await context.db.query(
      `UPDATE automatic_time_devices
          SET revoked_at = COALESCE(revoked_at, now())
        WHERE id = $1::uuid AND user_id = $2::uuid
      RETURNING *`,
      [req.params.deviceId, userId],
    ),
  );
  if (!rows[0]) return { status: 404, body: { message: 'Device not found' } };
  await context.events.emit('automatic-time.device_revoked', {
    deviceId: rows[0].id,
    userId,
  });
  return { status: 200, body: mapDevice(rows[0]) };
}

export async function syncDeviceDrafts(
  req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  if (req.auth?.type !== 'device') {
    return { status: 401, body: { message: 'Device authentication required' } };
  }
  const userId = requireUser(context);
  if (!userId) return { status: 401, body: { message: 'Authentication required' } };
  const drafts = bodyObject(req).drafts;
  if (!Array.isArray(drafts) || drafts.length === 0 || drafts.length > 100) {
    return { status: 400, body: { message: 'One to 100 derived drafts are required' } };
  }
  if (!drafts.every(validateDeviceDraft)) {
    return { status: 400, body: { message: 'Invalid derived draft payload' } };
  }

  const requestedIssueKeys = new Set(
    drafts.flatMap((draft) => [
      ...(draft.issueKey ? [draft.issueKey] : []),
      ...draft.assignmentAlternatives.map((alternative) => alternative.issueKey),
    ]),
  );
  const currentCandidates = requestedIssueKeys.size
    ? await context.api.issues.findCandidates({ includeUnassigned: true, limit: 100 })
    : [];
  const candidateByKey = new Map(currentCandidates.map((candidate) => [candidate.key, candidate]));
  if (Array.from(requestedIssueKeys).some((issueKey) => !candidateByKey.has(issueKey))) {
    return {
      status: 400,
      body: { message: 'Draft assignments must use bounded issue candidates' },
    };
  }

  const synced: Record<string, unknown>[] = [];
  for (const draft of drafts) {
    let issueId: string | null = null;
    let issueKey: string | null = null;
    if (draft.issueKey) {
      const candidate = candidateByKey.get(draft.issueKey)!;
      issueId = candidate.id;
      issueKey = candidate.key;
    }

    let rows = rowsFromQuery(
      await context.db.query(
        `INSERT INTO automatic_time_drafts (
         user_id, source_reference, local_date, started_at, ended_at,
         proposed_minutes, description, issue_id, issue_key, confidence,
         assignment_method, assignment_reasons, assignment_alternatives,
         ruleset_version, evidence_digest, correction_context_digest, suggested_issue_key
       ) VALUES ($1::uuid, $2, $3::date, $4::timestamptz, $5::timestamptz,
                 $6, $7, $8::uuid, $9, $10, $11, $12::jsonb, $13::jsonb, $14, $15, $16, $9)
       ON CONFLICT (user_id, source_reference) DO UPDATE SET
         local_date = EXCLUDED.local_date,
         started_at = EXCLUDED.started_at,
         ended_at = EXCLUDED.ended_at,
         proposed_minutes = EXCLUDED.proposed_minutes,
         description = EXCLUDED.description,
         issue_id = EXCLUDED.issue_id,
         issue_key = EXCLUDED.issue_key,
         confidence = EXCLUDED.confidence,
         assignment_method = EXCLUDED.assignment_method,
         assignment_reasons = EXCLUDED.assignment_reasons,
         assignment_alternatives = EXCLUDED.assignment_alternatives,
         ruleset_version = EXCLUDED.ruleset_version,
         evidence_digest = EXCLUDED.evidence_digest,
         correction_context_digest = EXCLUDED.correction_context_digest,
         suggested_issue_key = EXCLUDED.suggested_issue_key,
         updated_at = now()
       WHERE automatic_time_drafts.status = 'draft'
       RETURNING *`,
        [
          userId,
          draft.sourceReference,
          draft.localDate,
          draft.startedAt,
          draft.endedAt,
          draft.proposedMinutes,
          draft.description,
          issueId,
          issueKey,
          draft.confidence,
          draft.assignmentMethod,
          JSON.stringify(draft.assignmentReasons),
          JSON.stringify(draft.assignmentAlternatives),
          draft.rulesetVersion,
          draft.evidenceDigest,
          draft.correctionContextDigest ?? null,
        ],
      ),
    );
    if (!rows[0]) {
      rows = rowsFromQuery(
        await context.db.query(
          `SELECT * FROM automatic_time_drafts
            WHERE user_id = $1::uuid AND source_reference = $2`,
          [userId, draft.sourceReference],
        ),
      );
    }
    synced.push(mapDraft(rows[0]));
  }
  return { status: 201, body: synced };
}

export async function loadSyntheticDraftFixtures(
  req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  if (process.env.WEAVER_AUTOMATIC_TIME_FIXTURES !== 'enabled') {
    return { status: 404, body: { message: 'Synthetic fixtures are available only in tests' } };
  }
  const userId = requireUser(context);
  if (!userId) return { status: 401, body: { message: 'Authentication required' } };

  const fixtures = bodyObject(req).drafts;
  if (!Array.isArray(fixtures) || fixtures.length === 0 || fixtures.length > 100) {
    return { status: 400, body: { message: 'One to 100 synthetic drafts are required' } };
  }
  if (!fixtures.every(validateFixture)) {
    return { status: 400, body: { message: 'Invalid synthetic draft fixture' } };
  }

  const drafts: Record<string, unknown>[] = [];
  for (const fixture of fixtures) {
    const rows = rowsFromQuery(
      await context.db.query(
        `INSERT INTO automatic_time_drafts (
         user_id, source_reference, local_date, started_at, ended_at,
         proposed_minutes, description, confidence, assignment_method,
         assignment_reasons, assignment_alternatives, ruleset_version, evidence_digest
       ) VALUES ($1::uuid, $2, $3::date, $4::timestamptz, $5::timestamptz,
                 $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12, $13)
       ON CONFLICT (user_id, source_reference) DO UPDATE SET
         local_date = EXCLUDED.local_date,
         started_at = EXCLUDED.started_at,
         ended_at = EXCLUDED.ended_at,
         proposed_minutes = EXCLUDED.proposed_minutes,
         description = EXCLUDED.description,
         confidence = EXCLUDED.confidence,
         assignment_method = EXCLUDED.assignment_method,
         assignment_reasons = EXCLUDED.assignment_reasons,
         assignment_alternatives = EXCLUDED.assignment_alternatives,
         ruleset_version = EXCLUDED.ruleset_version,
         evidence_digest = EXCLUDED.evidence_digest,
         updated_at = now()
       RETURNING *`,
        [
          userId,
          fixture.sourceReference,
          fixture.localDate,
          fixture.startedAt,
          fixture.endedAt,
          fixture.proposedMinutes,
          fixture.description,
          fixture.confidence,
          fixture.assignmentMethod,
          JSON.stringify(fixture.assignmentReasons),
          JSON.stringify(fixture.assignmentAlternatives ?? []),
          fixture.rulesetVersion ?? 'synthetic-fixture-v1',
          fixture.evidenceDigest,
        ],
      ),
    );
    drafts.push(mapDraft(rows[0]));
  }

  return { status: 201, body: drafts };
}

export async function listIssueCandidates(
  _req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const userId = requireUser(context);
  if (!userId) return { status: 401, body: { message: 'Authentication required' } };
  const candidates = await context.api.issues.findCandidates({
    includeUnassigned: true,
    limit: 100,
  });
  return { status: 200, body: candidates };
}

export async function listCorrectionMemories(
  req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const userId = requireUser(context);
  if (!userId) return { status: 401, body: { message: 'Authentication required' } };
  const rows = rowsFromQuery(
    await context.db.query(
      `SELECT id, memory_type, normalized_features, target_project_key,
              target_issue_key, weight, positive_count, negative_count,
              enabled, last_applied_at, explanation, updated_at
         FROM automatic_time_correction_memories
        WHERE user_id = $1::uuid
          AND ($2::boolean = false OR enabled = true)
          AND (target_issue_key IS NOT NULL OR target_project_key IS NOT NULL)
        ORDER BY weight DESC, updated_at DESC
        LIMIT 200`,
      [userId, req.auth?.type === 'device'],
    ),
  );
  if (req.auth?.type !== 'device') {
    return { status: 200, body: rows.map(mapCorrectionMemory) };
  }
  const settings = rowsFromQuery(
    await context.db.query(
      `SELECT correction_revision, recompute_context_digests
         FROM automatic_time_user_settings
        WHERE user_id = $1::uuid`,
      [userId],
    ),
  )[0];
  return {
    status: 200,
    body: {
      revision: Number(settings?.correction_revision ?? 0),
      recomputeContextDigests: Array.isArray(settings?.recompute_context_digests)
        ? settings.recompute_context_digests.filter(
            (digest: unknown) =>
              digest === '*' || (typeof digest === 'string' && PRIVATE_CONTEXT_DIGEST.test(digest)),
          )
        : [],
      memories: rows.map(mapCorrectionMemory),
    },
  };
}

function recomputeMutationSql(changeSql: string): string {
  return `WITH changed AS (
            ${changeSql}
          ), memory AS (
            SELECT changed.*,
                   COALESCE(normalized_features->>'contextDigest', '*') AS recompute_key
              FROM changed
          ), settings AS (
            INSERT INTO automatic_time_user_settings (
              user_id, correction_revision, recompute_context_digests
            )
            SELECT user_id, 1, jsonb_build_array(recompute_key)
              FROM memory
            ON CONFLICT (user_id) DO UPDATE SET
              correction_revision = automatic_time_user_settings.correction_revision + 1,
              recompute_context_digests = (
                SELECT COALESCE(jsonb_agg(value ORDER BY value), '[]'::jsonb)
                  FROM (
                    SELECT DISTINCT value
                      FROM jsonb_array_elements_text(
                        automatic_time_user_settings.recompute_context_digests
                        || EXCLUDED.recompute_context_digests
                      ) AS values(value)
                  ) AS distinct_values
              ),
              updated_at = now()
            RETURNING correction_revision
          )
          SELECT memory.*,
                 settings.correction_revision AS recompute_revision,
                 (SELECT COUNT(*)::integer
                    FROM automatic_time_drafts draft
                   WHERE draft.user_id = memory.user_id
                     AND draft.status = 'draft'
                     AND (
                       memory.recompute_key = '*'
                       OR draft.correction_context_digest = memory.recompute_key
                     )) AS affected_draft_count
            FROM memory CROSS JOIN settings`;
}

function mapMemoryMutation(row: Row): Record<string, unknown> {
  return {
    ...mapCorrectionMemory(row),
    recomputeRevision: Number(row.recompute_revision),
    affectedDraftCount: Number(row.affected_draft_count),
  };
}

export async function updateCorrectionMemory(
  req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const userId = requireUser(context);
  if (!userId) return { status: 401, body: { message: 'Authentication required' } };
  const enabled = bodyObject(req).enabled;
  if (typeof enabled !== 'boolean') {
    return { status: 400, body: { message: 'enabled must be a boolean' } };
  }
  const rows = rowsFromQuery(
    await context.db.query(
      recomputeMutationSql(
        `UPDATE automatic_time_correction_memories
            SET enabled = $3, updated_at = now()
          WHERE id = $1::uuid AND user_id = $2::uuid
          RETURNING *`,
      ),
      [req.params.memoryId, userId, enabled],
    ),
  );
  if (!rows[0]) return { status: 404, body: { message: 'Correction memory not found' } };
  return { status: 200, body: mapMemoryMutation(rows[0]) };
}

export async function recomputeCorrectionMemory(
  req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const userId = requireUser(context);
  if (!userId) return { status: 401, body: { message: 'Authentication required' } };
  const rows = rowsFromQuery(
    await context.db.query(
      recomputeMutationSql(
        `SELECT *
           FROM automatic_time_correction_memories
          WHERE id = $1::uuid AND user_id = $2::uuid`,
      ),
      [req.params.memoryId, userId],
    ),
  );
  if (!rows[0]) return { status: 404, body: { message: 'Correction memory not found' } };
  return { status: 200, body: mapMemoryMutation(rows[0]) };
}

export async function deleteCorrectionMemory(
  req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const userId = requireUser(context);
  if (!userId) return { status: 401, body: { message: 'Authentication required' } };
  const rows = rowsFromQuery(
    await context.db.query(
      recomputeMutationSql(
        `DELETE FROM automatic_time_correction_memories
          WHERE id = $1::uuid AND user_id = $2::uuid
          RETURNING *`,
      ),
      [req.params.memoryId, userId],
    ),
  );
  if (!rows[0]) return { status: 404, body: { message: 'Correction memory not found' } };
  return { status: 204, body: null };
}

export async function listDrafts(
  req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const userId = requireUser(context);
  if (!userId) return { status: 401, body: { message: 'Authentication required' } };
  const localDate = req.query.date;
  if (localDate && !isLocalDate(localDate)) {
    return { status: 400, body: { message: 'date must use YYYY-MM-DD' } };
  }

  const rows = rowsFromQuery(
    await context.db.query(
      `SELECT *
       FROM automatic_time_drafts
      WHERE user_id = $1::uuid
        AND ($2::date IS NULL OR local_date = $2::date)
      ORDER BY started_at ASC`,
      [userId, localDate ?? null],
    ),
  );
  return { status: 200, body: rows.map(mapDraft) };
}

export async function getTimelineStatus(
  _req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const userId = requireUser(context);
  if (!userId) return { status: 401, body: { message: 'Authentication required' } };

  const devices = rowsFromQuery(
    await context.db.query(
      `SELECT *
         FROM automatic_time_devices
        WHERE user_id = $1::uuid
          AND revoked_at IS NULL
          AND (expires_at IS NULL OR expires_at > now())
        ORDER BY last_seen_at DESC NULLS LAST, created_at DESC
        LIMIT 1`,
      [userId],
    ),
  );
  const syncRows = rowsFromQuery(
    await context.db.query(
      `SELECT MAX(updated_at) AS last_draft_at
         FROM automatic_time_drafts
        WHERE user_id = $1::uuid`,
      [userId],
    ),
  );
  const device = devices[0];
  const lastSeenAt = device?.last_seen_at ? new Date(device.last_seen_at) : null;
  const ageMilliseconds = lastSeenAt ? Date.now() - lastSeenAt.valueOf() : null;
  const state = !device
    ? 'unpaired'
    : ageMilliseconds !== null && ageMilliseconds <= 2 * 60 * 1000
      ? 'active'
      : ageMilliseconds !== null && ageMilliseconds <= 15 * 60 * 1000
        ? 'stale'
        : 'offline';

  return {
    status: 200,
    body: {
      state,
      deviceId: device?.id ?? null,
      displayName: device?.display_name ?? null,
      lastSeenAt: lastSeenAt?.toISOString() ?? null,
      lastDraftAt: syncRows[0]?.last_draft_at
        ? new Date(syncRows[0].last_draft_at).toISOString()
        : null,
      refreshAfterSeconds: 15,
    },
  };
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

export async function getLocalAlphaMetrics(
  _req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const userId = requireUser(context);
  if (!userId) return { status: 401, body: { message: 'Authentication required' } };
  const metrics = rowsFromQuery(
    await context.db.query(
      `WITH draft_metrics AS (
         SELECT COALESCE(SUM(proposed_minutes) FILTER (
                  WHERE status <> 'superseded' AND source_reference NOT LIKE 'manual:%'
                ), 0)::integer AS captured_minutes,
                COUNT(*) FILTER (
                  WHERE status <> 'superseded' AND source_reference NOT LIKE 'manual:%'
                )::integer AS captured_draft_count,
                COUNT(*) FILTER (WHERE status = 'released')::integer AS released_draft_count,
                COUNT(*) FILTER (
                  WHERE status = 'released' AND suggested_issue_key = issue_key
                )::integer AS accepted_suggestion_count,
                COALESCE(SUM(proposed_minutes) FILTER (
                  WHERE status = 'released' AND suggested_issue_key = issue_key
                ), 0)::integer AS correct_minutes,
                COALESCE(SUM(proposed_minutes) FILTER (
                  WHERE status = 'released' AND source_reference NOT LIKE 'manual:%'
                ), 0)::integer AS released_captured_minutes,
                COUNT(*) FILTER (
                  WHERE status <> 'superseded'
                    AND source_reference NOT LIKE 'manual:%'
                    AND suggested_issue_key IS NULL
                )::integer AS unmatched_draft_count,
                COUNT(DISTINCT local_date) FILTER (WHERE status = 'released')::integer
                  AS working_day_count,
                MIN(local_date)::text AS first_local_date,
                MAX(local_date)::text AS last_local_date
           FROM automatic_time_drafts
          WHERE user_id = $1::uuid
       ), event_metrics AS (
         SELECT COUNT(DISTINCT draft_id) FILTER (WHERE action = 'reassigned')::integer
                  AS reassigned_draft_count,
                COUNT(*) FILTER (WHERE action IN ('rejected', 'deleted'))::integer
                  AS rejected_or_deleted_count
           FROM automatic_time_review_events
          WHERE user_id = $1::uuid
       ), review_metrics AS (
         SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_seconds)
                  AS median_review_seconds
           FROM automatic_time_review_sessions
          WHERE user_id = $1::uuid AND completed_at IS NOT NULL
       )
       SELECT * FROM draft_metrics CROSS JOIN event_metrics CROSS JOIN review_metrics`,
      [userId],
    ),
  )[0];
  const capturedDraftCount = Number(metrics?.captured_draft_count ?? 0);
  const releasedDraftCount = Number(metrics?.released_draft_count ?? 0);
  const acceptedSuggestionCount = Number(metrics?.accepted_suggestion_count ?? 0);
  const reassignedDraftCount = Number(metrics?.reassigned_draft_count ?? 0);
  const unmatchedDraftCount = Number(metrics?.unmatched_draft_count ?? 0);
  const correctMinutes = Number(metrics?.correct_minutes ?? 0);
  const releasedCapturedMinutes = Number(metrics?.released_captured_minutes ?? 0);
  const medianReviewSeconds =
    metrics?.median_review_seconds === null || metrics?.median_review_seconds === undefined
      ? null
      : Number(metrics.median_review_seconds);
  const workingDayCount = Number(metrics?.working_day_count ?? 0);
  const firstLocalDate = metrics?.first_local_date ? String(metrics.first_local_date) : null;
  const lastLocalDate = metrics?.last_local_date ? String(metrics.last_local_date) : null;
  const sourceCounts = await context.api.timeEntries.countOwnBySource({
    ...(firstLocalDate ? { loggedFrom: `${firstLocalDate}T00:00:00.000Z` } : {}),
    ...(lastLocalDate
      ? {
          loggedTo:
            new Date(`${lastLocalDate}T00:00:00.000Z`).toISOString().slice(0, 10) +
            'T23:59:59.999Z',
        }
      : {}),
  });
  const destinationAccuracy = ratio(correctMinutes, releasedCapturedMinutes);
  const correctionRate = ratio(reassignedDraftCount, releasedDraftCount);
  const unmatchedRate = ratio(unmatchedDraftCount, capturedDraftCount);
  const meetsAccuracyTarget = destinationAccuracy >= 0.8;
  const meetsReviewTarget = medianReviewSeconds !== null && medianReviewSeconds < 120;

  return {
    status: 200,
    body: {
      privateLocalMetric: true,
      firstLocalDate,
      lastLocalDate,
      workingDayCount,
      capturedMinutes: Number(metrics?.captured_minutes ?? 0),
      capturedDraftCount,
      releasedDraftCount,
      acceptedSuggestionCount,
      reassignedDraftCount,
      unmatchedDraftCount,
      rejectedOrDeletedCount: Number(metrics?.rejected_or_deleted_count ?? 0),
      destinationAccuracy,
      correctionRate,
      unmatchedRate,
      medianReviewSeconds,
      manualTimerEntryCount: sourceCounts.timer,
      manualEntryCount: sourceCounts.manual,
      meetsAccuracyTarget,
      meetsReviewTarget,
      alphaComplete: workingDayCount >= 10 && meetsAccuracyTarget && meetsReviewTarget,
    },
  };
}

export async function addOfflineDraft(
  req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const userId = requireUser(context);
  if (!userId) return { status: 401, body: { message: 'Authentication required' } };
  const body = bodyObject(req);
  if (!isLocalDate(body.localDate)) {
    return { status: 400, body: { message: 'localDate must use YYYY-MM-DD' } };
  }
  if (
    !isTimestamp(body.startedAt) ||
    !isTimestamp(body.endedAt) ||
    new Date(body.endedAt).valueOf() <= new Date(body.startedAt).valueOf()
  ) {
    return { status: 400, body: { message: 'Offline work requires a valid start and end' } };
  }
  if (
    !Number.isInteger(body.proposedMinutes) ||
    Number(body.proposedMinutes) < 1 ||
    Number(body.proposedMinutes) > 1440
  ) {
    return { status: 400, body: { message: 'proposedMinutes must be an integer from 1 to 1440' } };
  }
  if (
    typeof body.description !== 'string' ||
    !body.description.trim() ||
    body.description.length > 500
  ) {
    return {
      status: 400,
      body: { message: 'description is required and cannot exceed 500 characters' },
    };
  }

  let issue: Row | undefined;
  if (body.issueKey !== undefined) {
    if (typeof body.issueKey !== 'string' || !body.issueKey.trim()) {
      return { status: 400, body: { message: 'issueKey must be a non-empty string' } };
    }
    issue = (await context.api.issues.get(body.issueKey.trim())) as Row | undefined;
    if (!issue?.id) return { status: 404, body: { message: 'Issue not found' } };
  }

  const sourceReference = `manual:offline:${globalThis.crypto.randomUUID()}`;
  const rows = rowsFromQuery(
    await context.db.query(
      `INSERT INTO automatic_time_drafts (
         user_id, source_reference, local_date, started_at, ended_at,
         proposed_minutes, description, issue_id, issue_key, confidence,
         assignment_method, assignment_reasons, assignment_alternatives,
         ruleset_version, evidence_digest
       ) VALUES (
         $1::uuid, $2, $3::date, $4::timestamptz, $5::timestamptz,
         $6, $7, $8::uuid, $9, $10, 'manual-offline', $11::jsonb,
         '[]'::jsonb, 'manual-review-v1', $2
       )
       RETURNING *`,
      [
        userId,
        sourceReference,
        body.localDate,
        body.startedAt,
        body.endedAt,
        body.proposedMinutes,
        body.description.trim(),
        issue?.id ?? null,
        issue?.key ?? null,
        issue ? 1 : 0,
        JSON.stringify([
          issue ? 'Offline work assigned manually during review' : 'Offline work added manually',
        ]),
      ],
    ),
  );
  return { status: 201, body: mapDraft(rows[0]) };
}

export async function splitDraft(
  req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const userId = requireUser(context);
  if (!userId) return { status: 401, body: { message: 'Authentication required' } };
  const splitAt = bodyObject(req).splitAt;
  if (!isTimestamp(splitAt)) {
    return { status: 400, body: { message: 'splitAt must be an ISO-8601 timestamp' } };
  }

  const originals = rowsFromQuery(
    await context.db.query(
      `SELECT * FROM automatic_time_drafts
        WHERE id = $1::uuid AND user_id = $2::uuid AND status = 'draft'`,
      [req.params.draftId, userId],
    ),
  );
  const original = originals[0];
  if (!original) return { status: 404, body: { message: 'Draft not found' } };
  const startedAt = new Date(original.started_at).valueOf();
  const endedAt = new Date(original.ended_at).valueOf();
  const splitMilliseconds = new Date(splitAt).valueOf();
  const totalMinutes = Number(original.proposed_minutes);
  if (splitMilliseconds <= startedAt || splitMilliseconds >= endedAt || totalMinutes < 2) {
    return {
      status: 400,
      body: { message: 'Split time must be inside a draft containing at least two minutes' },
    };
  }
  const firstMinutes = Math.max(
    1,
    Math.min(
      totalMinutes - 1,
      Math.round((totalMinutes * (splitMilliseconds - startedAt)) / (endedAt - startedAt)),
    ),
  );
  const sourcePrefix = `manual:split:${globalThis.crypto.randomUUID()}`;
  const rows = rowsFromQuery(
    await context.db.query(
      `WITH superseded AS (
         UPDATE automatic_time_drafts
            SET status = 'superseded', updated_at = now()
          WHERE id = $1::uuid AND user_id = $2::uuid AND status = 'draft'
          RETURNING *
       ), inserted AS (
         INSERT INTO automatic_time_drafts (
           user_id, source_reference, local_date, started_at, ended_at,
           proposed_minutes, description, issue_id, issue_key, confidence,
           assignment_method, assignment_reasons, assignment_alternatives,
           ruleset_version, evidence_digest
         )
         SELECT user_id, part.source_reference, local_date, part.started_at, part.ended_at,
                part.minutes, description, issue_id, issue_key, confidence,
                'manual-split',
                assignment_reasons || '["Split manually during review"]'::jsonb,
                assignment_alternatives, 'manual-review-v1', part.source_reference
           FROM superseded
           CROSS JOIN LATERAL (
             VALUES
               ($3, started_at, $4::timestamptz, $5::integer),
               ($6, $4::timestamptz, ended_at, $7::integer)
           ) AS part(source_reference, started_at, ended_at, minutes)
         RETURNING *
       )
       SELECT * FROM inserted ORDER BY started_at ASC`,
      [
        original.id,
        userId,
        `${sourcePrefix}:1`,
        splitAt,
        firstMinutes,
        `${sourcePrefix}:2`,
        totalMinutes - firstMinutes,
      ],
    ),
  );
  if (rows.length !== 2) {
    return { status: 409, body: { message: 'Draft changed before it could be split' } };
  }
  return { status: 201, body: rows.map(mapDraft) };
}

export async function mergeDrafts(
  req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const userId = requireUser(context);
  if (!userId) return { status: 401, body: { message: 'Authentication required' } };
  const draftIds = bodyObject(req).draftIds;
  if (
    !Array.isArray(draftIds) ||
    draftIds.length < 2 ||
    draftIds.length > 20 ||
    new Set(draftIds).size !== draftIds.length ||
    !draftIds.every(isUuid)
  ) {
    return { status: 400, body: { message: 'Two to 20 unique draftIds are required' } };
  }

  const selected = rowsFromQuery(
    await context.db.query(
      `SELECT * FROM automatic_time_drafts
        WHERE user_id = $1::uuid AND id = ANY($2::uuid[]) AND status = 'draft'
        ORDER BY started_at ASC`,
      [userId, draftIds],
    ),
  );
  if (selected.length !== draftIds.length) {
    return { status: 404, body: { message: 'One or more drafts were not found' } };
  }
  const localDates = new Set(selected.map((draft) => normalizeLocalDate(draft.local_date)));
  if (localDates.size !== 1) {
    return { status: 400, body: { message: 'Merged drafts must belong to the same day' } };
  }
  const dayDrafts = rowsFromQuery(
    await context.db.query(
      `SELECT id FROM automatic_time_drafts
        WHERE user_id = $1::uuid AND local_date = $2::date AND status = 'draft'
        ORDER BY started_at ASC`,
      [userId, normalizeLocalDate(selected[0].local_date)],
    ),
  );
  const selectedSet = new Set(draftIds);
  const selectedIndexes = dayDrafts
    .map((draft, index) => (selectedSet.has(draft.id) ? index : -1))
    .filter((index) => index >= 0);
  if (
    selectedIndexes.some(
      (index, position) => position > 0 && index !== selectedIndexes[position - 1] + 1,
    )
  ) {
    return { status: 409, body: { message: 'Only adjacent drafts can be merged' } };
  }

  const description = Array.from(new Set(selected.map((draft) => String(draft.description))))
    .join(' · ')
    .slice(0, 500);
  const sourceReference = `manual:merge:${globalThis.crypto.randomUUID()}`;
  const rows = rowsFromQuery(
    await context.db.query(
      `WITH superseded AS (
         UPDATE automatic_time_drafts
            SET status = 'superseded', updated_at = now()
          WHERE user_id = $1::uuid AND id = ANY($2::uuid[]) AND status = 'draft'
          RETURNING *
       ), inserted AS (
         INSERT INTO automatic_time_drafts (
           user_id, source_reference, local_date, started_at, ended_at,
           proposed_minutes, description, issue_id, issue_key, confidence,
           assignment_method, assignment_reasons, assignment_alternatives,
           ruleset_version, evidence_digest
         )
         SELECT $1::uuid, $3, MIN(local_date), MIN(started_at), MAX(ended_at),
                SUM(proposed_minutes), $4,
                CASE WHEN COUNT(issue_id) = COUNT(*) AND COUNT(DISTINCT issue_id) = 1
                     THEN MIN(issue_id::text)::uuid ELSE NULL END,
                CASE WHEN COUNT(issue_key) = COUNT(*) AND COUNT(DISTINCT issue_key) = 1
                     THEN MIN(issue_key) ELSE NULL END,
                CASE WHEN COUNT(issue_id) = COUNT(*) AND COUNT(DISTINCT issue_id) = 1
                     THEN MIN(confidence) ELSE 0 END,
                'manual-merge', '["Merged manually during review"]'::jsonb,
                '[]'::jsonb, 'manual-review-v1', $3
           FROM superseded
         HAVING COUNT(*) = $5
         RETURNING *
       )
       SELECT * FROM inserted`,
      [userId, draftIds, sourceReference, description, draftIds.length],
    ),
  );
  if (!rows[0]) {
    return { status: 409, body: { message: 'Drafts changed before they could be merged' } };
  }
  return { status: 201, body: mapDraft(rows[0]) };
}

export async function assignDraft(
  req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const userId = requireUser(context);
  if (!userId) return { status: 401, body: { message: 'Authentication required' } };
  const issueKey = bodyObject(req).issueKey;
  if (typeof issueKey !== 'string' || !issueKey.trim()) {
    return { status: 400, body: { message: 'issueKey is required' } };
  }
  const issue = (await context.api.issues.get(issueKey.trim())) as Row | undefined;
  if (!issue?.id) return { status: 404, body: { message: 'Issue not found' } };

  const rows = rowsFromQuery(
    await context.db.query(
      `WITH current AS (
         SELECT *
           FROM automatic_time_drafts
          WHERE id = $4::uuid AND user_id = $5::uuid AND status = 'draft'
          FOR UPDATE
       ), updated AS (
         UPDATE automatic_time_drafts draft
            SET issue_id = $1::uuid,
                issue_key = $2,
                confidence = 1,
                assignment_method = 'manual',
                assignment_reasons = $3::jsonb,
                assignment_alternatives = '[]'::jsonb,
                ruleset_version = 'manual-review-v1',
                updated_at = now()
           FROM current
          WHERE draft.id = current.id
          RETURNING draft.*, current.issue_key AS previous_issue_key
       ), observation AS (
         INSERT INTO automatic_time_review_events (
           user_id, draft_id, local_date, action, from_issue_key,
           to_issue_key, proposed_minutes
         )
         SELECT user_id, id, local_date,
                CASE WHEN previous_issue_key IS NULL THEN 'assigned' ELSE 'reassigned' END,
                previous_issue_key, issue_key, proposed_minutes
           FROM updated
          WHERE previous_issue_key IS DISTINCT FROM issue_key
         RETURNING id
       ), positive_memory AS (
         INSERT INTO automatic_time_correction_memories (
           user_id, memory_type, normalized_features, target_issue_key,
           weight, positive_count, negative_count, last_applied_at, explanation
         )
         SELECT user_id, 'private-context-digest',
                jsonb_build_object('contextDigest', correction_context_digest),
                issue_key, 1, 1, 0, now(),
                'Private context confirmed for ' || issue_key
           FROM updated
          WHERE correction_context_digest IS NOT NULL
            AND previous_issue_key IS DISTINCT FROM issue_key
         ON CONFLICT (user_id, memory_type, normalized_features, target_issue_key)
           WHERE target_issue_key IS NOT NULL
         DO UPDATE SET
           positive_count = automatic_time_correction_memories.positive_count + 1,
           weight = LEAST(
             2,
             1 + LN(
               2 + automatic_time_correction_memories.positive_count
                 + automatic_time_correction_memories.negative_count
             ) * 0.25
           ),
           last_applied_at = now(), enabled = true, updated_at = now()
         RETURNING id
       ), negative_memory AS (
         INSERT INTO automatic_time_correction_memories (
           user_id, memory_type, normalized_features, target_issue_key,
           weight, positive_count, negative_count, last_applied_at, explanation
         )
         SELECT user_id, 'private-context-digest',
                jsonb_build_object('contextDigest', correction_context_digest),
                previous_issue_key, 1, 0, 1, now(),
                'Private context rejected for ' || previous_issue_key
           FROM updated
          WHERE correction_context_digest IS NOT NULL
            AND previous_issue_key IS NOT NULL
            AND previous_issue_key IS DISTINCT FROM issue_key
         ON CONFLICT (user_id, memory_type, normalized_features, target_issue_key)
           WHERE target_issue_key IS NOT NULL
         DO UPDATE SET
           negative_count = automatic_time_correction_memories.negative_count + 1,
           weight = LEAST(
             2,
             1 + LN(
               2 + automatic_time_correction_memories.positive_count
                 + automatic_time_correction_memories.negative_count
             ) * 0.25
           ),
           last_applied_at = now(), enabled = true, updated_at = now()
         RETURNING id
       )
       SELECT * FROM updated`,
      [
        issue.id,
        issue.key ?? issueKey.trim(),
        JSON.stringify(['Assigned manually during review']),
        req.params.draftId,
        userId,
      ],
    ),
  );
  if (!rows[0]) return { status: 404, body: { message: 'Draft not found' } };

  await context.events.emit('automatic-time.draft_corrected', {
    draftId: rows[0].id,
    userId,
    action: 'assigned',
    issueKey: rows[0].issue_key,
  });
  return { status: 200, body: mapDraft(rows[0]) };
}

export async function editDraft(
  req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const userId = requireUser(context);
  if (!userId) return { status: 401, body: { message: 'Authentication required' } };
  const body = bodyObject(req);
  const updates: string[] = [];
  const params: unknown[] = [];

  if (body.proposedMinutes !== undefined) {
    if (
      !Number.isInteger(body.proposedMinutes) ||
      Number(body.proposedMinutes) < 1 ||
      Number(body.proposedMinutes) > 1440
    ) {
      return {
        status: 400,
        body: { message: 'proposedMinutes must be an integer from 1 to 1440' },
      };
    }
    params.push(body.proposedMinutes);
    updates.push(`proposed_minutes = $${params.length}`);
  }
  if (body.description !== undefined) {
    if (typeof body.description !== 'string' || body.description.length > 500) {
      return { status: 400, body: { message: 'description cannot exceed 500 characters' } };
    }
    params.push(body.description);
    updates.push(`description = $${params.length}`);
  }
  if (body.startedAt !== undefined || body.endedAt !== undefined) {
    if (
      (body.startedAt !== undefined && !isTimestamp(body.startedAt)) ||
      (body.endedAt !== undefined && !isTimestamp(body.endedAt))
    ) {
      return {
        status: 400,
        body: { message: 'startedAt and endedAt must be ISO-8601 timestamps' },
      };
    }
    const currentRows = rowsFromQuery(
      await context.db.query(
        `SELECT started_at, ended_at
           FROM automatic_time_drafts
          WHERE id = $1::uuid AND user_id = $2::uuid AND status = 'draft'`,
        [req.params.draftId, userId],
      ),
    );
    const current = currentRows[0];
    if (!current) return { status: 404, body: { message: 'Draft not found' } };
    const nextStartedAt =
      body.startedAt === undefined ? new Date(current.started_at) : new Date(body.startedAt);
    const nextEndedAt =
      body.endedAt === undefined ? new Date(current.ended_at) : new Date(body.endedAt);
    if (nextEndedAt.valueOf() <= nextStartedAt.valueOf()) {
      return { status: 400, body: { message: 'endedAt must be after startedAt' } };
    }
    if (body.startedAt !== undefined) {
      params.push(body.startedAt);
      updates.push(`started_at = $${params.length}::timestamptz`);
    }
    if (body.endedAt !== undefined) {
      params.push(body.endedAt);
      updates.push(`ended_at = $${params.length}::timestamptz`);
    }
  }
  if (updates.length === 0) {
    return { status: 400, body: { message: 'No editable fields were supplied' } };
  }

  params.push(req.params.draftId, userId);
  const rows = rowsFromQuery(
    await context.db.query(
      `UPDATE automatic_time_drafts
        SET ${updates.join(', ')}, updated_at = now()
      WHERE id = $${params.length - 1}::uuid
        AND user_id = $${params.length}::uuid
        AND status = 'draft'
      RETURNING *`,
      params,
    ),
  );
  if (!rows[0]) return { status: 404, body: { message: 'Draft not found' } };

  await context.events.emit('automatic-time.draft_corrected', {
    draftId: rows[0].id,
    userId,
    action: 'edited',
  });
  return { status: 200, body: mapDraft(rows[0]) };
}

export async function hideDraft(
  req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const userId = requireUser(context);
  if (!userId) return { status: 401, body: { message: 'Authentication required' } };
  const rows = rowsFromQuery(
    await context.db.query(
      `WITH current AS (
         SELECT *
           FROM automatic_time_drafts
          WHERE id = $1::uuid AND user_id = $2::uuid AND status = 'draft'
          FOR UPDATE
       ), hidden AS (
         UPDATE automatic_time_drafts draft
            SET status = 'hidden', updated_at = now()
           FROM current
          WHERE draft.id = current.id
          RETURNING draft.*
       ), observation AS (
         INSERT INTO automatic_time_review_events (
           user_id, draft_id, local_date, action, from_issue_key, proposed_minutes
         )
         SELECT user_id, id, local_date, 'rejected', issue_key, proposed_minutes
           FROM current
         RETURNING id
       ), negative_memory AS (
         INSERT INTO automatic_time_correction_memories (
           user_id, memory_type, normalized_features, target_issue_key,
           weight, positive_count, negative_count, last_applied_at, explanation
         )
         SELECT user_id, 'private-context-digest',
                jsonb_build_object('contextDigest', correction_context_digest),
                issue_key, 1, 0, 1, now(), 'Private context rejected for ' || issue_key
           FROM current
          WHERE correction_context_digest IS NOT NULL AND issue_key IS NOT NULL
         ON CONFLICT (user_id, memory_type, normalized_features, target_issue_key)
           WHERE target_issue_key IS NOT NULL
         DO UPDATE SET
           negative_count = automatic_time_correction_memories.negative_count + 1,
           weight = LEAST(
             2,
             1 + LN(
               2 + automatic_time_correction_memories.positive_count
                 + automatic_time_correction_memories.negative_count
             ) * 0.25
           ),
           last_applied_at = now(), enabled = true, updated_at = now()
         RETURNING id
       )
       SELECT * FROM hidden`,
      [req.params.draftId, userId],
    ),
  );
  if (!rows[0]) return { status: 404, body: { message: 'Draft not found' } };
  return { status: 200, body: mapDraft(rows[0]) };
}

export async function deleteDraft(
  req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const userId = requireUser(context);
  if (!userId) return { status: 401, body: { message: 'Authentication required' } };
  const rows = rowsFromQuery(
    await context.db.query(
      `WITH current AS (
         SELECT *
           FROM automatic_time_drafts
          WHERE id = $1::uuid
            AND user_id = $2::uuid
            AND status IN ('draft', 'hidden')
          FOR UPDATE
       ), observation AS (
         INSERT INTO automatic_time_review_events (
           user_id, draft_id, local_date, action, from_issue_key, proposed_minutes
         )
         SELECT user_id, id, local_date, 'deleted', issue_key, proposed_minutes
           FROM current
         RETURNING id
       ), negative_memory AS (
         INSERT INTO automatic_time_correction_memories (
           user_id, memory_type, normalized_features, target_issue_key,
           weight, positive_count, negative_count, last_applied_at, explanation
         )
         SELECT user_id, 'private-context-digest',
                jsonb_build_object('contextDigest', correction_context_digest),
                issue_key, 1, 0, 1, now(), 'Private context rejected for ' || issue_key
           FROM current
          WHERE correction_context_digest IS NOT NULL AND issue_key IS NOT NULL
         ON CONFLICT (user_id, memory_type, normalized_features, target_issue_key)
           WHERE target_issue_key IS NOT NULL
         DO UPDATE SET
           negative_count = automatic_time_correction_memories.negative_count + 1,
           weight = LEAST(
             2,
             1 + LN(
               2 + automatic_time_correction_memories.positive_count
                 + automatic_time_correction_memories.negative_count
             ) * 0.25
           ),
           last_applied_at = now(), enabled = true, updated_at = now()
         RETURNING id
       ), deleted AS (
         DELETE FROM automatic_time_drafts draft
          USING current
          WHERE draft.id = current.id
          RETURNING draft.id
       )
       SELECT * FROM deleted`,
      [req.params.draftId, userId],
    ),
  );
  if (!rows[0]) return { status: 404, body: { message: 'Draft not found' } };
  return { status: 204, body: null };
}

export async function previewRelease(
  req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const userId = requireUser(context);
  if (!userId) return { status: 401, body: { message: 'Authentication required' } };
  const localDate = req.params.localDate;
  if (!isLocalDate(localDate)) {
    return { status: 400, body: { message: 'localDate must use YYYY-MM-DD' } };
  }
  const rows = rowsFromQuery(
    await context.db.query(
      `SELECT * FROM automatic_time_drafts
        WHERE user_id = $1::uuid AND local_date = $2::date
        ORDER BY started_at ASC`,
      [userId, localDate],
    ),
  );
  const drafts = rows.filter((row) => row.status === 'draft' && row.issue_id && row.issue_key);
  const unresolved = rows.filter(
    (row) => row.status === 'draft' && (!row.issue_id || !row.issue_key),
  );
  const hidden = rows.filter((row) => row.status === 'hidden');
  if (unresolved.length > 0 || drafts.length === 0) {
    return {
      status: 409,
      body: { message: 'Every draft must be assigned, hidden, or deleted before preview' },
    };
  }
  const reportedTotalMinutes = bodyObject(req).reportedTotalMinutes;
  if (!validateReportedTotal(reportedTotalMinutes, drafts.length)) {
    return {
      status: 400,
      body: {
        message: `reportedTotalMinutes must be an integer from ${drafts.length} to 1440`,
      },
    };
  }
  return {
    status: 200,
    body: buildReleasePreview(drafts, hidden, reportedTotalMinutes),
  };
}

export async function getDailyReview(
  req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const userId = requireUser(context);
  if (!userId) return { status: 401, body: { message: 'Authentication required' } };
  const localDate = req.params.localDate;
  if (!isLocalDate(localDate)) {
    return { status: 400, body: { message: 'localDate must use YYYY-MM-DD' } };
  }

  await context.db.query(
    `INSERT INTO automatic_time_review_sessions (user_id, local_date)
     VALUES ($1::uuid, $2::date)
     ON CONFLICT (user_id, local_date) DO NOTHING`,
    [userId, localDate],
  );

  const rows = rowsFromQuery(
    await context.db.query(
      `SELECT *
       FROM automatic_time_drafts
      WHERE user_id = $1::uuid AND local_date = $2::date
      ORDER BY started_at ASC`,
      [userId, localDate],
    ),
  );
  const releaseBatches = rowsFromQuery(
    await context.db.query(
      `SELECT *
       FROM automatic_time_release_batches
      WHERE user_id = $1::uuid AND local_date = $2::date`,
      [userId, localDate],
    ),
  );
  const releaseBatch = releaseBatches[0];
  const releasable = rows.filter((row) => row.status === 'draft' && row.issue_id);
  const unresolved = rows.filter((row) => row.status === 'draft' && !row.issue_id);
  const hidden = rows.filter((row) => row.status === 'hidden');
  const released = rows.filter((row) => row.status === 'released');
  const officialTimeEntryIds = Array.isArray(releaseBatch?.official_time_entry_ids)
    ? releaseBatch.official_time_entry_ids.filter(isUuid)
    : [];
  const lockStates =
    officialTimeEntryIds.length > 0 &&
    (releaseBatch?.status === 'released' || releaseBatch?.status === 'partially_locked')
      ? await context.api.timeEntries.getLockState(officialTimeEntryIds)
      : [];
  const lockedEntryCount = lockStates.filter((entry) => entry.locked).length;
  const proposedRows = released.length > 0 ? released : releasable;
  const proposedTotalMinutes = proposedRows.reduce(
    (total, row) => total + Number(row.proposed_minutes),
    0,
  );
  const hiddenTotalMinutes = hidden.reduce((total, row) => total + Number(row.proposed_minutes), 0);
  const unresolvedTotalMinutes = unresolved.reduce(
    (total, row) => total + Number(row.proposed_minutes),
    0,
  );
  const reportedTotalMinutes =
    releaseBatch?.status === 'released' || releaseBatch?.status === 'partially_locked'
      ? Number(releaseBatch.reported_total_minutes)
      : proposedTotalMinutes;

  return {
    status: 200,
    body: {
      localDate,
      ready: unresolved.length === 0 && releasable.length > 0,
      releasableDraftCount: releasable.length,
      hiddenDraftCount: hidden.length,
      unresolvedDraftCount: unresolved.length,
      releasedDraftCount: released.length,
      releaseStatus: releaseBatch?.status ?? null,
      capturedTotalMinutes: proposedTotalMinutes + unresolvedTotalMinutes + hiddenTotalMinutes,
      hiddenTotalMinutes,
      proposedTotalMinutes,
      reportedTotalMinutes,
      manualAdjustmentMinutes: reportedTotalMinutes - proposedTotalMinutes,
      officialEntryCount: officialTimeEntryIds.length,
      lockedEntryCount,
      canReopen:
        officialTimeEntryIds.length > 0 &&
        lockedEntryCount === 0 &&
        ['released', 'partially_locked', 'reopening'].includes(String(releaseBatch?.status)),
      drafts: rows.map(mapDraft),
    },
  };
}

export async function reopenDay(
  req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const userId = requireUser(context);
  if (!userId) return { status: 401, body: { message: 'Authentication required' } };
  const localDate = req.params.localDate;
  if (!isLocalDate(localDate)) {
    return { status: 400, body: { message: 'localDate must use YYYY-MM-DD' } };
  }
  const batches = rowsFromQuery(
    await context.db.query(
      `SELECT * FROM automatic_time_release_batches
        WHERE user_id = $1::uuid AND local_date = $2::date`,
      [userId, localDate],
    ),
  );
  const batch = batches[0];
  if (batch?.status === 'reopened') {
    const reopenedDrafts = rowsFromQuery(
      await context.db.query(
        `SELECT COUNT(*)::integer AS reopened_draft_count
           FROM automatic_time_drafts
          WHERE user_id = $1::uuid AND local_date = $2::date AND status = 'draft'`,
        [userId, localDate],
      ),
    );
    return {
      status: 200,
      body: {
        ...mapReleaseBatch(batch),
        reopenedDraftCount: Number(reopenedDrafts[0]?.reopened_draft_count ?? 0),
      },
    };
  }
  if (!batch || !['released', 'partially_locked', 'reopening'].includes(String(batch.status))) {
    return { status: 409, body: { message: 'Only a released day can be reopened' } };
  }
  const officialTimeEntryIds = Array.isArray(batch.official_time_entry_ids)
    ? batch.official_time_entry_ids.filter(isUuid)
    : [];
  if (officialTimeEntryIds.length === 0) {
    return { status: 409, body: { message: 'The release mapping has no official entries' } };
  }
  const releasedDrafts = rowsFromQuery(
    await context.db.query(
      `SELECT source_reference
         FROM automatic_time_drafts
        WHERE user_id = $1::uuid AND release_batch_id = $2::uuid AND status = 'released'`,
      [userId, batch.id],
    ),
  );
  if (releasedDrafts.length === 0) {
    return { status: 409, body: { message: 'The release mapping has no private drafts' } };
  }
  const currentEntries = await context.api.timeEntries.list({
    sourceReferences: releasedDrafts.map((draft) => String(draft.source_reference)),
  });
  const mappedEntryIds = new Set(officialTimeEntryIds);
  const currentMappedEntries = currentEntries.filter((entry) => mappedEntryIds.has(entry.id));
  if (
    currentEntries.length !== currentMappedEntries.length ||
    (currentMappedEntries.length !== 0 &&
      currentMappedEntries.length !== officialTimeEntryIds.length)
  ) {
    return {
      status: 409,
      body: {
        status: 'reopening',
        message: 'The official entry mapping is incomplete and requires recovery before reopening',
        officialEntryCount: officialTimeEntryIds.length,
        existingEntryCount: currentMappedEntries.length,
      },
    };
  }

  if (currentMappedEntries.length === officialTimeEntryIds.length) {
    const lockStates = await context.api.timeEntries.getLockState(officialTimeEntryIds);
    const lockedEntryCount = lockStates.filter((entry) => entry.locked).length;
    if (lockedEntryCount > 0) {
      await context.db.query(
        `UPDATE automatic_time_release_batches
            SET status = 'partially_locked'
          WHERE id = $1::uuid AND user_id = $2::uuid`,
        [batch.id, userId],
      );
      return {
        status: 409,
        body: {
          status: 'partially_locked',
          message: 'Locked official entries must be unlocked before this day can be reopened',
          lockedEntryCount,
          officialEntryCount: officialTimeEntryIds.length,
        },
      };
    }
  }

  const reopening = rowsFromQuery(
    await context.db.query(
      `UPDATE automatic_time_release_batches
          SET status = 'reopening'
        WHERE id = $1::uuid
          AND user_id = $2::uuid
          AND status IN ('released', 'partially_locked', 'reopening')
        RETURNING id`,
      [batch.id, userId],
    ),
  );
  if (!reopening[0]) {
    return { status: 409, body: { message: 'The day changed before reopening could begin' } };
  }

  if (currentMappedEntries.length > 0) {
    await context.api.timeEntries.deleteBatch(officialTimeEntryIds);
  }
  const reopened = rowsFromQuery(
    await context.db.query(
      `WITH reopened_batch AS (
         UPDATE automatic_time_release_batches
            SET status = 'reopened',
                official_time_entry_ids = '[]'::jsonb,
                released_at = NULL,
                reopened_at = now()
          WHERE id = $1::uuid AND user_id = $2::uuid AND status = 'reopening'
          RETURNING *
       ), reopened_drafts AS (
         UPDATE automatic_time_drafts
            SET status = 'draft',
                release_batch_id = NULL,
                released_at = NULL,
                updated_at = now()
          WHERE user_id = $2::uuid
            AND release_batch_id = (SELECT id FROM reopened_batch)
            AND status = 'released'
          RETURNING id
       )
       SELECT reopened_batch.*,
              (SELECT COUNT(*)::integer FROM reopened_drafts) AS reopened_draft_count
         FROM reopened_batch`,
      [batch.id, userId],
    ),
  );
  if (!reopened[0]) {
    throw new Error('Official entries were removed but the private day could not be reopened');
  }
  await context.events.emit('automatic-time.day_reopened', {
    batchId: batch.id,
    userId,
    localDate,
    officialTimeEntryIds,
  });
  return {
    status: 200,
    body: {
      ...mapReleaseBatch(reopened[0]),
      reopenedDraftCount: Number(reopened[0].reopened_draft_count),
    },
  };
}

async function releasedRetry(
  context: PluginContext,
  batch: Row,
  userId: string,
): Promise<PluginResponse> {
  const draftRows = rowsFromQuery(
    await context.db.query(
      `SELECT source_reference
       FROM automatic_time_drafts
      WHERE user_id = $1::uuid AND release_batch_id = $2::uuid AND status = 'released'`,
      [userId, batch.id],
    ),
  );
  const entries = await context.api.timeEntries.list({
    sourceReferences: draftRows.map((row) => row.source_reference),
  });
  return {
    status: 200,
    body: { batch: mapReleaseBatch(batch), entries, created: 0 },
  };
}

export async function releaseDay(
  req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const userId = requireUser(context);
  if (!userId) return { status: 401, body: { message: 'Authentication required' } };
  const localDate = req.params.localDate;
  if (!isLocalDate(localDate)) {
    return { status: 400, body: { message: 'localDate must use YYYY-MM-DD' } };
  }
  const body = bodyObject(req);
  const idempotencyKey = body.idempotencyKey;
  if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim() || idempotencyKey.length > 200) {
    return { status: 400, body: { message: 'idempotencyKey is required' } };
  }
  if (
    body.reportedTotalMinutes !== undefined &&
    (!Number.isInteger(body.reportedTotalMinutes) ||
      Number(body.reportedTotalMinutes) < 1 ||
      Number(body.reportedTotalMinutes) > 1440)
  ) {
    return {
      status: 400,
      body: { message: 'reportedTotalMinutes must be an integer from 1 to 1440' },
    };
  }

  let existingBatches = rowsFromQuery(
    await context.db.query(
      `SELECT *
       FROM automatic_time_release_batches
      WHERE user_id = $1::uuid AND local_date = $2::date`,
      [userId, localDate],
    ),
  );
  let batch = existingBatches[0];
  if (batch && batch.idempotency_key !== idempotencyKey.trim()) {
    return { status: 409, body: { message: 'This day already has a different release request' } };
  }
  if (batch?.status === 'released') {
    if (
      body.reportedTotalMinutes !== undefined &&
      Number(body.reportedTotalMinutes) !== Number(batch.reported_total_minutes)
    ) {
      return { status: 409, body: { message: 'This day was released with a different total' } };
    }
    return releasedRetry(context, batch, userId);
  }

  const dayRows = rowsFromQuery(
    await context.db.query(
      `SELECT *
       FROM automatic_time_drafts
      WHERE user_id = $1::uuid
        AND local_date = $2::date
        AND status IN ('draft', 'hidden')
      ORDER BY started_at ASC`,
      [userId, localDate],
    ),
  );
  const drafts = dayRows.filter((draft) => draft.status === 'draft');
  const hidden = dayRows.filter((draft) => draft.status === 'hidden');
  if (drafts.length === 0) {
    return { status: 409, body: { message: 'There are no reviewed drafts to release' } };
  }
  if (drafts.some((draft) => !draft.issue_id || !draft.issue_key)) {
    return {
      status: 409,
      body: { message: 'Every draft must be assigned, hidden, or deleted before release' },
    };
  }

  const proposedTotalMinutes = drafts.reduce(
    (total, draft) => total + Number(draft.proposed_minutes),
    0,
  );
  const reportedTotalMinutes =
    body.reportedTotalMinutes === undefined
      ? proposedTotalMinutes
      : Number(body.reportedTotalMinutes);
  if (!validateReportedTotal(reportedTotalMinutes, drafts.length)) {
    return {
      status: 400,
      body: {
        message: `reportedTotalMinutes must be an integer from ${drafts.length} to 1440`,
      },
    };
  }
  if (
    batch?.status === 'pending' &&
    Number(batch.reported_total_minutes) !== reportedTotalMinutes
  ) {
    return {
      status: 409,
      body: { message: 'This release is already pending with a different total' },
    };
  }
  const preview = buildReleasePreview(drafts, hidden, reportedTotalMinutes);
  if (!batch) {
    const inserted = rowsFromQuery(
      await context.db.query(
        `INSERT INTO automatic_time_release_batches (
         user_id, local_date, idempotency_key, status, reported_total_minutes
       ) VALUES ($1::uuid, $2::date, $3, 'pending', $4)
       ON CONFLICT (user_id, local_date) DO NOTHING
       RETURNING *`,
        [userId, localDate, idempotencyKey.trim(), reportedTotalMinutes],
      ),
    );
    batch = inserted[0];
    if (!batch) {
      existingBatches = rowsFromQuery(
        await context.db.query(
          `SELECT * FROM automatic_time_release_batches
          WHERE user_id = $1::uuid AND local_date = $2::date`,
          [userId, localDate],
        ),
      );
      batch = existingBatches[0];
      if (!batch || batch.idempotency_key !== idempotencyKey.trim()) {
        return { status: 409, body: { message: 'This day is already being released' } };
      }
      if (batch.status === 'released') return releasedRetry(context, batch, userId);
    }
  }

  const coreResult = await context.api.timeEntries.createBatch({
    entries: preview.entries.map((entry) => ({
      issueKey: entry.issueKey,
      sourceReference: entry.sourceReference,
      minutes: entry.minutes,
      description: entry.description,
      startedAt: entry.startedAt,
      endedAt: entry.endedAt,
      loggedAt: entry.startedAt,
    })),
  });
  const entryIds = coreResult.entries.map((entry: PluginTimeEntry) => entry.id);
  const draftIds = drafts.map((draft) => draft.id);

  const releasedBatches = rowsFromQuery(
    await context.db.query(
      `WITH released_drafts AS (
       UPDATE automatic_time_drafts
          SET status = 'released',
              release_batch_id = $1::uuid,
              released_at = now(),
              updated_at = now()
        WHERE id = ANY($2::uuid[])
          AND user_id = $3::uuid
          AND status = 'draft'
        RETURNING id
     ), completed_review AS (
       UPDATE automatic_time_review_sessions
          SET completed_at = now(),
              duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (now() - opened_at))::integer)
        WHERE user_id = $3::uuid AND local_date = $7::date
        RETURNING duration_seconds
     )
     UPDATE automatic_time_release_batches
        SET status = 'released',
            reported_total_minutes = $4,
            official_time_entry_ids = $5::jsonb,
            review_duration_seconds = (SELECT duration_seconds FROM completed_review),
            released_at = now(),
            reopened_at = NULL
      WHERE id = $1::uuid
        AND user_id = $3::uuid
        AND (SELECT COUNT(*) FROM released_drafts) = $6
      RETURNING *`,
      [
        batch.id,
        draftIds,
        userId,
        reportedTotalMinutes,
        JSON.stringify(entryIds),
        draftIds.length,
        localDate,
      ],
    ),
  );
  if (!releasedBatches[0]) {
    throw new Error(
      'Official entries were created but the private release mapping is pending retry',
    );
  }

  await context.events.emit('automatic-time.day_released', {
    batchId: batch.id,
    userId,
    localDate,
    officialTimeEntryIds: entryIds,
  });
  return {
    status: 200,
    body: {
      batch: mapReleaseBatch(releasedBatches[0]),
      entries: coreResult.entries,
      created: coreResult.created,
    },
  };
}
