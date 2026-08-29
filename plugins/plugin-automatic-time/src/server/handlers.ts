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
  evidenceDigest: string;
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
    status: row.status,
    evidenceDigest: row.evidence_digest,
    releaseBatchId: row.release_batch_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    releasedAt: row.released_at,
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
    fixture.assignmentReasons.every((reason) => typeof reason === 'string') &&
    typeof fixture.evidenceDigest === 'string' &&
    fixture.evidenceDigest.length > 0 &&
    fixture.evidenceDigest.length <= 200
  );
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
         assignment_reasons, evidence_digest
       ) VALUES ($1::uuid, $2, $3::date, $4::timestamptz, $5::timestamptz,
                 $6, $7, $8, $9, $10::jsonb, $11)
       ON CONFLICT (user_id, source_reference) DO UPDATE SET
         local_date = EXCLUDED.local_date,
         started_at = EXCLUDED.started_at,
         ended_at = EXCLUDED.ended_at,
         proposed_minutes = EXCLUDED.proposed_minutes,
         description = EXCLUDED.description,
         confidence = EXCLUDED.confidence,
         assignment_method = EXCLUDED.assignment_method,
         assignment_reasons = EXCLUDED.assignment_reasons,
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
