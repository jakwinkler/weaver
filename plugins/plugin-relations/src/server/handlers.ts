import type { PluginRequest, PluginResponse, PluginContext } from '@weaver/sdk';

/** Map each stored link type to its source and target display labels */
const LINK_TYPE_LABELS: Record<string, { source: string; target: string }> = {
  blocks:            { source: 'blocks',            target: 'is blocked by' },
  is_blocked_by:     { source: 'is blocked by',     target: 'blocks' },
  relates_to:        { source: 'relates to',        target: 'relates to' },
  duplicates:        { source: 'duplicates',        target: 'is duplicated by' },
  is_duplicated_by:  { source: 'is duplicated by',  target: 'duplicates' },
  causes:            { source: 'causes',            target: 'is caused by' },
  is_caused_by:      { source: 'is caused by',      target: 'causes' },
  clones:            { source: 'clones',            target: 'is cloned from' },
  is_cloned_from:    { source: 'is cloned from',    target: 'clones' },
};

async function getIssueByKey(
  context: PluginContext,
  issueKey: string,
): Promise<{ id: string; key: string; summary: string; project_id: string } | null> {
  const rows = await context.db.query(
    'SELECT id, key, summary, project_id FROM issues WHERE key = $1',
    [issueKey],
  );
  return (rows as any[])[0] ?? null;
}

function shouldTrackActivity(context: PluginContext): boolean {
  return context.settings.trackActivity !== false;
}

export async function listRelations(
  req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const { issueKey } = req.params;
  const issue = await getIssueByKey(context, issueKey);
  if (!issue) return { status: 404, body: { message: 'Issue not found' } };

  const rows = await context.db.query(
    `SELECT
       il.id,
       il.link_type AS "linkType",
       il.source_issue_id AS "sourceIssueId",
       il.target_issue_id AS "targetIssueId",
       il.created_at AS "createdAt",
       si.key AS "sourceKey",
       si.summary AS "sourceSummary",
       ti.key AS "targetKey",
       ti.summary AS "targetSummary",
       sp.key AS "sourceProjectKey",
       sp.name AS "sourceProjectName",
       tp.key AS "targetProjectKey",
       tp.name AS "targetProjectName",
       ts.name AS "targetStatusName",
       ts.category AS "targetStatusCategory",
       ss.name AS "sourceStatusName",
       ss.category AS "sourceStatusCategory"
     FROM issue_links il
     JOIN issues si ON si.id = il.source_issue_id
     JOIN issues ti ON ti.id = il.target_issue_id
     JOIN projects sp ON sp.id = si.project_id
     JOIN projects tp ON tp.id = ti.project_id
     LEFT JOIN workflow_statuses ts ON ts.id = ti.status_id
     LEFT JOIN workflow_statuses ss ON ss.id = si.status_id
     WHERE il.source_issue_id = $1 OR il.target_issue_id = $1
     ORDER BY il.created_at DESC`,
    [issue.id],
  );

  const relations = (rows as any[]).map((row) => {
    const isSource = row.sourceIssueId === issue.id;
    const labels = LINK_TYPE_LABELS[row.linkType] ?? { source: row.linkType, target: row.linkType };

    return {
      id: row.id,
      linkType: row.linkType,
      direction: isSource ? 'outward' : 'inward',
      label: isSource ? labels.source : labels.target,
      relatedIssue: {
        key: isSource ? row.targetKey : row.sourceKey,
        summary: isSource ? row.targetSummary : row.sourceSummary,
        projectKey: isSource ? row.targetProjectKey : row.sourceProjectKey,
        projectName: isSource ? row.targetProjectName : row.sourceProjectName,
        statusName: isSource ? row.targetStatusName : row.sourceStatusName,
        statusCategory: isSource ? row.targetStatusCategory : row.sourceStatusCategory,
      },
    };
  });

  return { status: 200, body: relations };
}

export async function createRelation(
  req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const { issueKey } = req.params;
  const { targetIssueKey, linkType } = req.body as { targetIssueKey: string; linkType: string };

  if (!targetIssueKey || !linkType) {
    return { status: 400, body: { message: 'targetIssueKey and linkType are required' } };
  }

  if (!LINK_TYPE_LABELS[linkType]) {
    return { status: 400, body: { message: `Invalid link type: ${linkType}` } };
  }

  const sourceIssue = await getIssueByKey(context, issueKey);
  if (!sourceIssue) return { status: 404, body: { message: `Source issue not found: ${issueKey}` } };

  const targetIssue = await getIssueByKey(context, targetIssueKey);
  if (!targetIssue) return { status: 404, body: { message: `Target issue not found: ${targetIssueKey}` } };

  if (sourceIssue.id === targetIssue.id) {
    return { status: 400, body: { message: 'Cannot create a relation to the same issue' } };
  }

  // Check for duplicate
  const existing = await context.db.query(
    `SELECT id FROM issue_links
     WHERE link_type = $1 AND source_issue_id = $2 AND target_issue_id = $3`,
    [linkType, sourceIssue.id, targetIssue.id],
  );
  if ((existing as any[]).length > 0) {
    return { status: 409, body: { message: 'This relation already exists' } };
  }

  const inserted = await context.db.query(
    `INSERT INTO issue_links (link_type, source_issue_id, target_issue_id)
     VALUES ($1, $2, $3)
     RETURNING id, link_type AS "linkType", source_issue_id AS "sourceIssueId", target_issue_id AS "targetIssueId", created_at AS "createdAt"`,
    [linkType, sourceIssue.id, targetIssue.id],
  );

  const link = (inserted as any[])[0];
  const labels = LINK_TYPE_LABELS[linkType];

  await context.events.emit('relation.created', {
    issueKey,
    targetIssueKey,
    linkType,
    linkId: link.id,
  });

  if (shouldTrackActivity(context)) {
    try {
      await context.api.activityLog.create(issueKey, {
        action: 'relation_created',
        fieldName: 'relation',
        newValue: `${labels.source} ${targetIssueKey}`,
      });
    } catch (err: any) {
      context.logger.error('Failed to log relation activity', { error: err.message });
    }
  }

  return { status: 201, body: link };
}

export async function deleteRelation(
  req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const { issueKey, linkId } = req.params;

  const issue = await getIssueByKey(context, issueKey);
  if (!issue) return { status: 404, body: { message: 'Issue not found' } };

  // Verify link exists and belongs to this issue
  const rows = await context.db.query(
    `SELECT il.id, il.link_type AS "linkType",
            il.source_issue_id AS "sourceIssueId",
            il.target_issue_id AS "targetIssueId",
            si.key AS "sourceKey", ti.key AS "targetKey"
     FROM issue_links il
     JOIN issues si ON si.id = il.source_issue_id
     JOIN issues ti ON ti.id = il.target_issue_id
     WHERE il.id = $1 AND (il.source_issue_id = $2 OR il.target_issue_id = $2)`,
    [linkId, issue.id],
  );

  if ((rows as any[]).length === 0) {
    return { status: 404, body: { message: 'Relation not found' } };
  }

  const link = (rows as any[])[0];
  const isSource = link.sourceIssueId === issue.id;
  const labels = LINK_TYPE_LABELS[link.linkType] ?? { source: link.linkType, target: link.linkType };
  const relatedKey = isSource ? link.targetKey : link.sourceKey;
  const label = isSource ? labels.source : labels.target;

  await context.db.query('DELETE FROM issue_links WHERE id = $1', [linkId]);

  await context.events.emit('relation.removed', {
    issueKey,
    targetIssueKey: relatedKey,
    linkType: link.linkType,
    linkId,
  });

  if (shouldTrackActivity(context)) {
    try {
      await context.api.activityLog.create(issueKey, {
        action: 'relation_removed',
        fieldName: 'relation',
        oldValue: `${label} ${relatedKey}`,
      });
    } catch (err: any) {
      context.logger.error('Failed to log relation removal activity', { error: err.message });
    }
  }

  return { status: 204, body: null };
}

export async function searchIssues(
  req: PluginRequest,
  context: PluginContext,
): Promise<PluginResponse> {
  const { issueKey } = req.params;
  const q = (req.query.q || '').trim();

  if (!q || q.length < 2) {
    return { status: 200, body: [] };
  }

  const issue = await getIssueByKey(context, issueKey);
  if (!issue) return { status: 404, body: { message: 'Issue not found' } };

  const rows = await context.db.query(
    `SELECT i.key, i.summary, p.key AS "projectKey",
            ws.name AS "statusName", ws.category AS "statusCategory"
     FROM issues i
     JOIN projects p ON p.id = i.project_id
     LEFT JOIN workflow_statuses ws ON ws.id = i.status_id
     WHERE i.id != $1
       AND (i.key ILIKE $2 OR i.summary ILIKE $2)
     ORDER BY i.key ASC
     LIMIT 20`,
    [issue.id, `%${q}%`],
  );

  return { status: 200, body: rows };
}
