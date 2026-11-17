import { IssueAccessPolicyEntity, type IssueEntity } from '@weaver/db';
import type { EntityManager, SelectQueryBuilder, ObjectLiteral } from 'typeorm';

export interface IssuePrincipal {
  userId: string;
  role: string;
}

export function issueAccessPredicate(manager: EntityManager, alias: string, user?: IssuePrincipal) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(alias)) throw new Error('Invalid issue alias');
  alias = `"${alias}"`;
  if (user && ['owner', 'admin'].includes(user.role)) return { sql: 'TRUE', parameters: {} };
  const table = manager
    .getRepository(IssueAccessPolicyEntity)
    .metadata.tablePath.split('.')
    .map((v) => `"${v.replaceAll('"', '""')}"`)
    .join('.');
  return {
    sql: `(${alias}.access_state = 'unrestricted' OR (${alias}.access_state = 'restricted' AND EXISTS (SELECT 1 FROM ${table} issue_policy WHERE issue_policy.id = ${alias}.access_policy_id AND issue_policy.project_id = ${alias}.project_id AND issue_policy.reviewed = true AND :issueAccessUserId = ANY(issue_policy.user_ids))))`,
    parameters: { issueAccessUserId: user?.userId ?? '00000000-0000-0000-0000-000000000000' },
  };
}

export function restrictIssueQuery<T extends ObjectLiteral>(
  manager: EntityManager,
  query: SelectQueryBuilder<T>,
  user?: IssuePrincipal,
  alias = 'issue',
) {
  const predicate = issueAccessPredicate(manager, alias, user);
  return query.andWhere(predicate.sql, predicate.parameters);
}

export async function canReadIssue(
  manager: EntityManager,
  issue: Pick<IssueEntity, 'accessState' | 'accessPolicyId' | 'projectId'>,
  user?: IssuePrincipal,
): Promise<boolean> {
  if (user && ['owner', 'admin'].includes(user.role)) return true;
  if (issue.accessState === 'unrestricted') return true;
  if (!user || issue.accessState !== 'restricted' || !issue.accessPolicyId) return false;
  const policy = await manager
    .getRepository(IssueAccessPolicyEntity)
    .findOneBy({ id: issue.accessPolicyId, projectId: issue.projectId, reviewed: true });
  return !!policy?.userIds.includes(user.userId);
}
