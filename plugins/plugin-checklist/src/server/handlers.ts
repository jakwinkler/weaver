import type { PluginRequest, PluginResponse, PluginContext } from '@weaver/sdk';

async function getIssueId(context: PluginContext, issueKey: string): Promise<string | null> {
  const issue = await context.api.issues.get(issueKey);
  return issue ? (issue as any).id : null;
}

function shouldTrackActivity(context: PluginContext): boolean {
  // Default to true if setting is not explicitly set (manifest default is true)
  return context.settings.trackActivity !== false;
}

async function syncDoneRatio(context: PluginContext, issueId: string, issueKey: string): Promise<void> {
  if (!context.settings.syncDoneRatio) return;

  const rows = await context.db.query(
    'SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE is_done = true) AS done FROM checklist_items WHERE issue_id = $1',
    [issueId],
  );
  const { total, done } = (rows as any[])[0];
  const percentDone = total > 0 ? Math.round((done / total) * 100) : 0;
  await context.api.issues.update(issueKey, { percent_done: percentDone });
}

export async function listAllItems(req: PluginRequest, context: PluginContext): Promise<PluginResponse> {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
  const offset = parseInt(req.query.offset || '0', 10);

  const rows = await context.db.query(
    `SELECT ci.*, i.key AS issue_key, i.title AS issue_title
     FROM checklist_items ci
     JOIN issues i ON i.id = ci.issue_id
     ORDER BY ci.updated_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  );

  return { status: 200, body: rows };
}

export async function listItems(req: PluginRequest, context: PluginContext): Promise<PluginResponse> {
  const { issueKey } = req.params;
  const issueId = await getIssueId(context, issueKey);
  if (!issueId) return { status: 404, body: { message: 'Issue not found' } };

  const rows = await context.db.query(
    'SELECT * FROM checklist_items WHERE issue_id = $1 ORDER BY position ASC, created_at ASC',
    [issueId],
  );

  return { status: 200, body: rows };
}

export async function addItem(req: PluginRequest, context: PluginContext): Promise<PluginResponse> {
  const { issueKey } = req.params;
  const { subject } = req.body as { subject: string };

  if (!subject || !subject.trim()) {
    return { status: 400, body: { message: 'Subject is required' } };
  }

  const issueId = await getIssueId(context, issueKey);
  if (!issueId) return { status: 404, body: { message: 'Issue not found' } };

  // Get next position
  const posResult = await context.db.query(
    'SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM checklist_items WHERE issue_id = $1',
    [issueId],
  );
  const nextPos = (posResult as any[])[0].next_pos;

  const rows = await context.db.query(
    `INSERT INTO checklist_items (issue_id, subject, position, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [issueId, subject.trim(), nextPos, context.user?.id || null],
  );

  await context.events.emit('checklist.item_added', {
    issueKey,
    itemId: (rows as any[])[0].id,
    subject: subject.trim(),
  });

  if (shouldTrackActivity(context)) {
    try {
      context.logger.info('Logging checklist activity: item_added', { issueKey, subject: subject.trim() });
      await context.api.activityLog.create(issueKey, {
        action: 'checklist_item_added',
        fieldName: 'checklist',
        newValue: subject.trim(),
      });
      context.logger.info('Activity logged successfully');
    } catch (err: any) {
      context.logger.error('Failed to log checklist activity', { error: err.message });
    }
  }

  await syncDoneRatio(context, issueId, issueKey);

  return { status: 201, body: (rows as any[])[0] };
}

export async function updateItem(req: PluginRequest, context: PluginContext): Promise<PluginResponse> {
  const { issueKey, itemId } = req.params;
  const body = req.body as { subject?: string; is_done?: boolean };

  const issueId = await getIssueId(context, issueKey);
  if (!issueId) return { status: 404, body: { message: 'Issue not found' } };

  // Fetch existing item for activity log diffing
  const existingRows = await context.db.query(
    'SELECT * FROM checklist_items WHERE id = $1 AND issue_id = $2',
    [itemId, issueId],
  );
  const existingItem = (existingRows as any[])[0];

  const sets: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (body.subject !== undefined) {
    sets.push(`subject = $${paramIndex++}`);
    values.push(body.subject.trim());
  }
  if (body.is_done !== undefined) {
    sets.push(`is_done = $${paramIndex++}`);
    values.push(body.is_done);
  }

  if (sets.length === 0) {
    return { status: 400, body: { message: 'No fields to update' } };
  }

  sets.push(`updated_at = now()`);
  values.push(itemId, issueId);

  const rows = await context.db.query(
    `UPDATE checklist_items SET ${sets.join(', ')} WHERE id = $${paramIndex++} AND issue_id = $${paramIndex} RETURNING *`,
    values,
  );

  if ((rows as any[]).length === 0) {
    return { status: 404, body: { message: 'Checklist item not found' } };
  }

  const updated = (rows as any[])[0];

  if (body.is_done === true) {
    await context.events.emit('checklist.item_completed', {
      issueKey,
      itemId,
      subject: updated.subject,
    });
  }

  if (shouldTrackActivity(context) && existingItem) {
    if (body.is_done !== undefined && body.is_done !== existingItem.is_done) {
      await context.api.activityLog.create(issueKey, {
        action: body.is_done ? 'checklist_item_completed' : 'checklist_item_reopened',
        fieldName: 'checklist',
        newValue: updated.subject,
      });
    }
    if (body.subject !== undefined && body.subject.trim() !== existingItem.subject) {
      await context.api.activityLog.create(issueKey, {
        action: 'checklist_item_updated',
        fieldName: 'checklist',
        oldValue: existingItem.subject,
        newValue: body.subject.trim(),
      });
    }
  }

  await syncDoneRatio(context, issueId, issueKey);

  return { status: 200, body: updated };
}

export async function deleteItem(req: PluginRequest, context: PluginContext): Promise<PluginResponse> {
  const { issueKey, itemId } = req.params;

  const issueId = await getIssueId(context, issueKey);
  if (!issueId) return { status: 404, body: { message: 'Issue not found' } };

  const existing = await context.db.query(
    'SELECT * FROM checklist_items WHERE id = $1 AND issue_id = $2',
    [itemId, issueId],
  );
  if ((existing as any[]).length === 0) {
    return { status: 404, body: { message: 'Checklist item not found' } };
  }

  await context.db.query(
    'DELETE FROM checklist_items WHERE id = $1 AND issue_id = $2',
    [itemId, issueId],
  );

  const deletedSubject = (existing as any[])[0].subject;

  await context.events.emit('checklist.item_removed', {
    issueKey,
    itemId,
    subject: deletedSubject,
  });

  if (shouldTrackActivity(context)) {
    await context.api.activityLog.create(issueKey, {
      action: 'checklist_item_removed',
      fieldName: 'checklist',
      oldValue: deletedSubject,
    });
  }

  await syncDoneRatio(context, issueId, issueKey);

  return { status: 204, body: null };
}

export async function reorderItems(req: PluginRequest, context: PluginContext): Promise<PluginResponse> {
  const { issueKey } = req.params;
  const { order } = req.body as { order: string[] };

  if (!Array.isArray(order)) {
    return { status: 400, body: { message: 'order must be an array of item IDs' } };
  }

  const issueId = await getIssueId(context, issueKey);
  if (!issueId) return { status: 404, body: { message: 'Issue not found' } };

  for (let i = 0; i < order.length; i++) {
    await context.db.query(
      'UPDATE checklist_items SET position = $1, updated_at = now() WHERE id = $2 AND issue_id = $3',
      [i, order[i], issueId],
    );
  }

  const rows = await context.db.query(
    'SELECT * FROM checklist_items WHERE issue_id = $1 ORDER BY position ASC',
    [issueId],
  );

  return { status: 200, body: rows };
}
