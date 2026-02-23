import type { PluginRequest, PluginResponse, PluginContext } from '@weaver/sdk';

const VALID_GROUP_BY = ['project', 'user', 'issue'] as const;

function buildReportQuery(
  query: Record<string, string>,
): { sql: string; params: unknown[]; groupBy: string } {
  const { projectKey, userId, dateFrom, dateTo, groupBy = 'project' } = query;
  const safeGroupBy = VALID_GROUP_BY.includes(groupBy as any) ? groupBy : 'project';

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (dateFrom) {
    conditions.push(`te.logged_at >= $${paramIdx++}`);
    params.push(dateFrom);
  }
  if (dateTo) {
    conditions.push(`te.logged_at <= $${paramIdx++}`);
    params.push(dateTo);
  }
  if (projectKey) {
    conditions.push(`p.key = $${paramIdx++}`);
    params.push(projectKey);
  }
  if (userId) {
    conditions.push(`te.user_id = $${paramIdx++}::uuid`);
    params.push(userId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  let selectFields: string;
  let groupByClause: string;
  let orderBy: string;

  switch (safeGroupBy) {
    case 'user':
      selectFields = `te.user_id, COALESCE(u.display_name, u.email, te.user_id::text) AS label`;
      groupByClause = `GROUP BY te.user_id, u.display_name, u.email`;
      orderBy = 'total_minutes DESC';
      break;
    case 'issue':
      selectFields = `i.key AS issue_key, i.title AS issue_title`;
      groupByClause = `GROUP BY i.id, i.key, i.title`;
      orderBy = 'total_minutes DESC';
      break;
    default: // project
      selectFields = `p.key AS project_key, p.name AS project_name`;
      groupByClause = `GROUP BY p.id, p.key, p.name`;
      orderBy = 'total_minutes DESC';
      break;
  }

  const userJoin = safeGroupBy === 'user'
    ? `LEFT JOIN users u ON u.id = te.user_id`
    : '';

  const sql = `
    SELECT ${selectFields},
           COALESCE(SUM(te.minutes), 0)::int AS total_minutes,
           COUNT(*)::int AS entry_count
    FROM time_entries te
    JOIN issues i ON i.id = te.issue_id
    JOIN projects p ON p.id = i.project_id
    ${userJoin}
    ${whereClause}
    ${groupByClause}
    ORDER BY ${orderBy}
  `;

  return { sql, params, groupBy: safeGroupBy };
}

export async function getReport(req: PluginRequest, context: PluginContext): Promise<PluginResponse> {
  const { sql, params, groupBy } = buildReportQuery(req.query);
  const rows = await context.db.query(sql, params) as any[];

  const totalMinutes = rows.reduce((sum, r) => sum + r.total_minutes, 0);
  const totalEntries = rows.reduce((sum, r) => sum + r.entry_count, 0);

  return {
    status: 200,
    body: {
      groupBy,
      rows,
      totals: { totalMinutes, totalEntries },
    },
  };
}

export async function exportCsv(req: PluginRequest, context: PluginContext): Promise<PluginResponse> {
  const { sql, params, groupBy } = buildReportQuery(req.query);
  const rows = await context.db.query(sql, params) as any[];

  const totalMinutes = rows.reduce((sum: number, r: any) => sum + r.total_minutes, 0);
  const totalEntries = rows.reduce((sum: number, r: any) => sum + r.entry_count, 0);

  let headerLine: string;
  let formatRow: (r: any) => string;

  switch (groupBy) {
    case 'user':
      headerLine = 'User,Total Hours,Entry Count';
      formatRow = (r) => `"${csvEscape(r.label)}",${(r.total_minutes / 60).toFixed(2)},${r.entry_count}`;
      break;
    case 'issue':
      headerLine = 'Issue Key,Issue Title,Total Hours,Entry Count';
      formatRow = (r) => `"${csvEscape(r.issue_key)}","${csvEscape(r.issue_title)}",${(r.total_minutes / 60).toFixed(2)},${r.entry_count}`;
      break;
    default:
      headerLine = 'Project Key,Project Name,Total Hours,Entry Count';
      formatRow = (r) => `"${csvEscape(r.project_key)}","${csvEscape(r.project_name)}",${(r.total_minutes / 60).toFixed(2)},${r.entry_count}`;
      break;
  }

  const csvLines = [headerLine, ...rows.map(formatRow)];
  csvLines.push('');
  csvLines.push(`"Total",${(totalMinutes / 60).toFixed(2)},${totalEntries}`);

  return {
    status: 200,
    body: csvLines.join('\n'),
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename=time-report.csv',
    },
  };
}

export async function listSavedReports(req: PluginRequest, context: PluginContext): Promise<PluginResponse> {
  if (!context.user?.id) {
    return { status: 401, body: { message: 'Authentication required' } };
  }

  const rows = await context.db.query(
    'SELECT * FROM saved_time_reports WHERE created_by = $1 ORDER BY created_at DESC',
    [context.user.id],
  );

  return { status: 200, body: rows };
}

export async function saveReport(req: PluginRequest, context: PluginContext): Promise<PluginResponse> {
  if (!context.user?.id) {
    return { status: 401, body: { message: 'Authentication required' } };
  }

  const { name, filters, groupBy } = req.body as {
    name: string;
    filters: Record<string, unknown>;
    groupBy: string;
  };

  if (!name || !name.trim()) {
    return { status: 400, body: { message: 'Report name is required' } };
  }

  const safeGroupBy = VALID_GROUP_BY.includes(groupBy as any) ? groupBy : 'project';

  const rows = await context.db.query(
    `INSERT INTO saved_time_reports (name, filters, group_by, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [name.trim(), JSON.stringify(filters || {}), safeGroupBy, context.user.id],
  );

  return { status: 201, body: (rows as any[])[0] };
}

export async function deleteSavedReport(req: PluginRequest, context: PluginContext): Promise<PluginResponse> {
  if (!context.user?.id) {
    return { status: 401, body: { message: 'Authentication required' } };
  }

  const { reportId } = req.params;

  const existing = await context.db.query(
    'SELECT * FROM saved_time_reports WHERE id = $1 AND created_by = $2',
    [reportId, context.user.id],
  );

  if ((existing as any[]).length === 0) {
    return { status: 404, body: { message: 'Saved report not found' } };
  }

  await context.db.query(
    'DELETE FROM saved_time_reports WHERE id = $1 AND created_by = $2',
    [reportId, context.user.id],
  );

  return { status: 204, body: null };
}

function csvEscape(value: string): string {
  if (!value) return '';
  return value.replace(/"/g, '""');
}
