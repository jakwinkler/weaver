import type { SelectQueryBuilder } from 'typeorm';
import type { IssueEntity } from '@weaver/db';
import type { PaginationParams } from '../../common/pagination';

export function applyIssueListOrder(
  qb: SelectQueryBuilder<IssueEntity>,
  params: PaginationParams,
  fields: Record<string, unknown>,
): PaginationParams {
  const sort = params.sort ?? (fields['jira.source-id'] ? '-key' : undefined);
  if (sort === 'key' || sort === '-key') {
    qb.addSelect("CAST(substring(issue.key from '[0-9]+$') AS numeric)", 'issue_key_number')
      .orderBy('issue_key_number', sort === '-key' ? 'DESC' : 'ASC', 'NULLS LAST')
      .addOrderBy('issue.key', 'ASC');
    return { ...params, sort: undefined };
  }
  if (!sort) qb.orderBy('issue.sortOrder', 'ASC').addOrderBy('issue.createdAt', 'ASC');
  return params;
}
