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
  'issueKey',
]);

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

function mapDraft(row: Row): Record<string, unknown> {
  return {
    id: row.id,
    userId: row.user_id,
    sourceReference: row.source_reference,
    localDate:
      row.local_date instanceof Date
        ? row.local_date.toISOString().slice(0, 10)
        : String(row.local_date).slice(0, 10),
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
    explanation: row.explanation,
    updatedAt: row.updated_at,
  };
}

function mapReleaseBatch(row: Row): Record<string, unknown> {
  return {
    id: row.id,
    localDate:
      row.local_date instanceof Date
        ? row.local_date.toISOString().slice(0, 10)
        : String(row.local_date).slice(0, 10),
    idempotencyKey: row.idempotency_key,
    status: row.status,
    reportedTotalMinutes: row.reported_total_minutes,
    officialTimeEntryIds: row.official_time_entry_ids,
    createdAt: row.created_at,
    releasedAt: row.released_at,
  };
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
         ruleset_version, evidence_digest
       ) VALUES ($1::uuid, $2, $3::date, $4::timestamptz, $5::timestamptz,
                 $6, $7, $8::uuid, $9, $10, $11, $12::jsonb, $13::jsonb, $14, $15)
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
  _req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const userId = requireUser(context);
  if (!userId) return { status: 401, body: { message: 'Authentication required' } };
  const rows = rowsFromQuery(
    await context.db.query(
      `SELECT id, memory_type, normalized_features, target_project_key,
              target_issue_key, weight, positive_count, negative_count,
              explanation, updated_at
         FROM automatic_time_correction_memories
        WHERE user_id = $1::uuid
          AND enabled = true
          AND (target_issue_key IS NOT NULL OR target_project_key IS NOT NULL)
        ORDER BY weight DESC, updated_at DESC
        LIMIT 200`,
      [userId],
    ),
  );
  return { status: 200, body: rows.map(mapCorrectionMemory) };
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
      `UPDATE automatic_time_drafts
        SET issue_id = $1::uuid,
            issue_key = $2,
            confidence = 1,
            assignment_method = 'manual',
            assignment_reasons = $3::jsonb,
            assignment_alternatives = '[]'::jsonb,
            ruleset_version = 'manual-review-v1',
            updated_at = now()
      WHERE id = $4::uuid AND user_id = $5::uuid AND status = 'draft'
      RETURNING *`,
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
      `UPDATE automatic_time_drafts
        SET status = 'hidden', updated_at = now()
      WHERE id = $1::uuid AND user_id = $2::uuid AND status = 'draft'
      RETURNING *`,
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
      `DELETE FROM automatic_time_drafts
      WHERE id = $1::uuid
        AND user_id = $2::uuid
        AND status IN ('draft', 'hidden')
      RETURNING id`,
      [req.params.draftId, userId],
    ),
  );
  if (!rows[0]) return { status: 404, body: { message: 'Draft not found' } };
  return { status: 204, body: null };
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
      reportedTotalMinutes:
        releaseBatch?.status === 'released'
          ? releaseBatch.reported_total_minutes
          : releasable.reduce((total, row) => total + row.proposed_minutes, 0),
      drafts: rows.map(mapDraft),
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
  const idempotencyKey = bodyObject(req).idempotencyKey;
  if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim() || idempotencyKey.length > 200) {
    return { status: 400, body: { message: 'idempotencyKey is required' } };
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
    return releasedRetry(context, batch, userId);
  }

  const drafts = rowsFromQuery(
    await context.db.query(
      `SELECT *
       FROM automatic_time_drafts
      WHERE user_id = $1::uuid AND local_date = $2::date AND status = 'draft'
      ORDER BY started_at ASC`,
      [userId, localDate],
    ),
  );
  if (drafts.length === 0) {
    return { status: 409, body: { message: 'There are no reviewed drafts to release' } };
  }
  if (drafts.some((draft) => !draft.issue_id || !draft.issue_key)) {
    return {
      status: 409,
      body: { message: 'Every draft must be assigned, hidden, or deleted before release' },
    };
  }

  const totalMinutes = drafts.reduce((total, draft) => total + draft.proposed_minutes, 0);
  if (!batch) {
    const inserted = rowsFromQuery(
      await context.db.query(
        `INSERT INTO automatic_time_release_batches (
         user_id, local_date, idempotency_key, status, reported_total_minutes
       ) VALUES ($1::uuid, $2::date, $3, 'pending', $4)
       ON CONFLICT (user_id, local_date) DO NOTHING
       RETURNING *`,
        [userId, localDate, idempotencyKey.trim(), totalMinutes],
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
    entries: drafts.map((draft) => ({
      issueKey: draft.issue_key,
      sourceReference: draft.source_reference,
      minutes: draft.proposed_minutes,
      description: draft.description,
      startedAt: new Date(draft.started_at).toISOString(),
      endedAt: new Date(draft.ended_at).toISOString(),
      loggedAt: new Date(draft.started_at).toISOString(),
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
     )
     UPDATE automatic_time_release_batches
        SET status = 'released',
            reported_total_minutes = $4,
            official_time_entry_ids = $5::jsonb,
            released_at = now()
      WHERE id = $1::uuid
        AND user_id = $3::uuid
        AND (SELECT COUNT(*) FROM released_drafts) = $6
      RETURNING *`,
      [batch.id, draftIds, userId, totalMinutes, JSON.stringify(entryIds), draftIds.length],
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
