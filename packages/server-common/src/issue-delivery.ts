import { assertTenantSchemaName } from './tenant-job';

type Database = { query(sql: string, parameters?: any[]): Promise<any> };

export function recipientIssueCondition(
  schema: string,
  keyExpression: string,
  userExpression: string,
  tenantExpression: string,
): string {
  assertTenantSchemaName(schema);
  return `EXISTS (SELECT 1 FROM "${schema}".issues delivery_issue
    JOIN "${schema}".projects delivery_project ON delivery_project.id = delivery_issue.project_id
    JOIN public.tenant_memberships delivery_member ON delivery_member.tenant_id = ${tenantExpression} AND delivery_member.user_id = ${userExpression}
    WHERE delivery_issue.key = ${keyExpression} AND (delivery_member.role IN ('owner','admin') OR (
      delivery_project.import_quarantined = false AND (delivery_project.visibility = 'public' OR EXISTS (SELECT 1 FROM "${schema}".project_members pm WHERE pm.project_id = delivery_project.id AND pm.user_id = delivery_member.user_id))
      AND (delivery_issue.access_state = 'unrestricted' OR (delivery_issue.access_state = 'restricted' AND EXISTS (SELECT 1 FROM "${schema}".issue_access_policies policy WHERE policy.id = delivery_issue.access_policy_id AND policy.project_id = delivery_issue.project_id AND policy.reviewed = true AND delivery_member.user_id = ANY(policy.user_ids))))
    )))`;
}

/** Fresh membership/project/issue checks for queued delivery and long-running downloads. */
export async function recipientCanReadIssue(
  db: Database,
  schema: string,
  tenantId: string,
  userId: string,
  reference: { key?: string; id?: string },
): Promise<boolean> {
  assertTenantSchemaName(schema);
  if (!reference.key && !reference.id) return false;
  const rows = await db.query(
    `SELECT 1 FROM "${schema}".issues i
    JOIN "${schema}".projects p ON p.id = i.project_id
    JOIN public.tenant_memberships m ON m.tenant_id = $1 AND m.user_id = $2
    JOIN public.tenants t ON t.id = m.tenant_id AND t.schema_name = $5
    WHERE (($3::text IS NOT NULL AND i.key = $3) OR ($4::uuid IS NOT NULL AND i.id = $4))
      AND (m.role IN ('owner', 'admin') OR (
        p.import_quarantined = false
        AND (p.visibility = 'public' OR EXISTS (SELECT 1 FROM "${schema}".project_members pm WHERE pm.project_id = p.id AND pm.user_id = m.user_id))
        AND (i.access_state = 'unrestricted' OR (i.access_state = 'restricted' AND EXISTS (
          SELECT 1 FROM "${schema}".issue_access_policies policy WHERE policy.id = i.access_policy_id AND policy.project_id = i.project_id AND policy.reviewed = true AND m.user_id = ANY(policy.user_ids)
        )))
      )) LIMIT 1`,
    [tenantId, userId, reference.key ?? null, reference.id ?? null, schema],
  );
  return rows.length > 0;
}

/** Extract references before rendering. Identifier fields are not prose or issue keys. */
export function collectIssueReferences(payload: unknown): { keys: string[]; ids: string[] } {
  const keys = new Set<string>();
  const ids = new Set<string>();
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const collect = (value: unknown, field = ''): void => {
    if (Array.isArray(value)) return value.forEach((entry) => collect(entry, field));
    if (typeof value === 'string') {
      if (/issue_?ids?$/i.test(field)) {
        ids.add(value);
        return;
      }
      if (/ids?$/i.test(field) || uuid.test(value)) return;
      let decoded = value;
      try {
        decoded = decodeURIComponent(value);
      } catch {
        /* Plain text may contain percent signs. */
      }
      for (const [key] of decoded.matchAll(/\b[A-Za-z][A-Za-z0-9_]*-\d+\b/g)) keys.add(key);
    } else if (value && typeof value === 'object') {
      for (const [name, entry] of Object.entries(value)) collect(entry, name);
    }
  };
  collect(payload);
  return { keys: [...keys], ids: [...ids] };
}

/** Broad webhooks have no approved secured-issue audience. Recheck at the final send boundary. */
export async function eventHasRestrictedContent(
  db: Database,
  schema: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  assertTenantSchemaName(schema);
  const { keys: issueKeys, ids: issueIds } = collectIssueReferences(payload);
  if (issueKeys.length || issueIds.length) {
    // Unknown/deleted references cannot establish safe delivery of a retained payload.
    const rows = await db.query(
      `SELECT i.id, i.key, i.access_state, p.import_quarantined FROM "${schema}".issues i JOIN "${schema}".projects p ON p.id = i.project_id WHERE i.key = ANY($1::text[]) OR i.id::text = ANY($2::text[])`,
      [issueKeys, issueIds],
    );
    return (
      issueKeys.some((key) => !rows.some((r: any) => r.key === key)) ||
      issueIds.some((id) => !rows.some((r: any) => r.id === id)) ||
      rows.some((r: any) => r.access_state !== 'unrestricted' || r.import_quarantined === true)
    );
  }
  // Project/sprint summaries can contain issue identities or aggregate counts.
  const rows = await db.query(
    `SELECT 1 FROM "${schema}".issues i JOIN "${schema}".projects p ON p.id = i.project_id WHERE (i.access_state <> 'unrestricted' OR p.import_quarantined = true) AND ($1::text IS NULL OR p.key = $1) AND ($2::text IS NULL OR p.id::text = $2) LIMIT 1`,
    [
      typeof payload.projectKey === 'string' ? payload.projectKey : null,
      typeof payload.projectId === 'string' ? payload.projectId : null,
    ],
  );
  return rows.length > 0;
}
