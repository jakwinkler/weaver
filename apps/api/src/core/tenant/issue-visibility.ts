import { issueAccessPredicate } from '@weaver/jira-import';
import { IssueEntity, ProjectEntity } from '@weaver/db';
import { Raw, type EntityManager, type ObjectLiteral, type SelectQueryBuilder } from 'typeorm';
import { getTenantContext } from './tenant.context';
import type { RequestUser } from '../auth';

export function visibleIssues<T extends ObjectLiteral>(
  em: EntityManager,
  qb: SelectQueryBuilder<T>,
  user = getTenantContext()?.actor,
  alias = 'issue',
) {
  const predicate = visibleIssuePredicate(em, alias, user);
  return qb.andWhere(predicate.sql, predicate.parameters);
}

export function issueVisibilityWhere(
  em: EntityManager,
  user: RequestUser | undefined = getTenantContext()?.actor,
) {
  return {
    accessState: Raw(
      (column) => {
        const alias = column.slice(0, column.lastIndexOf('.'));
        return visibleIssuePredicate(em, alias, user).sql;
      },
      { issueAccessUserId: user?.userId ?? '00000000-0000-0000-0000-000000000000' },
    ),
  };
}

export function visibleIssuePredicate(em: EntityManager, alias: string, user?: RequestUser) {
  const predicate = issueAccessPredicate(em, alias, user);
  if (user && ['owner', 'admin'].includes(user.role)) return predicate;
  const table = em
    .getRepository(ProjectEntity)
    .metadata.tablePath.split('.')
    .map((part) => `"${part.replaceAll('"', '""')}"`)
    .join('.');
  const memberTable = table.replace(/"projects"$/, '"project_members"');
  return {
    ...predicate,
    sql: `(${predicate.sql} AND EXISTS (SELECT 1 FROM ${table} visible_project WHERE visible_project.id = "${alias}".project_id AND visible_project.import_quarantined = false AND (visible_project.visibility = 'public' OR EXISTS (SELECT 1 FROM ${memberTable} visible_member WHERE visible_member.project_id = visible_project.id AND visible_member.user_id = :issueAccessUserId))))`,
  };
}

export async function readableIssueIds(em: EntityManager): Promise<string[]> {
  return (
    await visibleIssues(
      em,
      em.getRepository(IssueEntity).createQueryBuilder('issue').select('issue.id'),
    ).getMany()
  ).map((issue) => issue.id);
}
