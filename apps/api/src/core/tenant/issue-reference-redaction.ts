import { IssueEntity } from '@weaver/db';
import type { EntityManager } from 'typeorm';
import type { RequestUser } from '../auth';
import { visibleIssuePredicate } from './issue-visibility';

/** Defense for references embedded in otherwise readable issues, history, and plugin responses.
 * Lists and aggregates still must apply authorization in SQL before pagination.
 */
export async function redactIssueReferences<T>(
  em: EntityManager,
  value: T,
  user?: RequestUser,
): Promise<T> {
  if (user && ['owner', 'admin'].includes(user.role)) return value;
  const predicate = visibleIssuePredicate(em, 'issue', user);
  const hidden = await em
    .getRepository(IssueEntity)
    .createQueryBuilder('issue')
    .select(['issue.id', 'issue.key', 'issue.customFields'])
    .where(`NOT ${predicate.sql}`, predicate.parameters)
    .getMany();
  const ids = new Set(hidden.map((issue) => issue.id));
  const keys = new Set(
    hidden
      .flatMap((issue) => [issue.key, issue.customFields?.['jira.original-key']])
      .filter((key): key is string => typeof key === 'string'),
  );
  return maskReferences(value, ids, keys) as T;
}

export function maskReferences(value: unknown, ids: Set<string>, keys: Set<string>): unknown {
  const mentions = (text: string) => {
    let decoded = text;
    try {
      decoded = decodeURIComponent(text);
    } catch {
      /* Plain text can contain percent signs. */
    }
    return [...decoded.matchAll(/[A-Za-z][A-Za-z0-9_]*-\d+/g)].some(([key]) => keys.has(key));
  };
  const visit = (item: unknown): unknown => {
    if (typeof item === 'string')
      return ids.has(item) ? null : mentions(item) ? '[Restricted issue reference]' : item;
    if (Array.isArray(item)) return item.map(visit).filter((entry) => entry !== null);
    if (!item || typeof item !== 'object' || item instanceof Date || Buffer.isBuffer(item))
      return item;
    const record = item as Record<string, unknown>;
    if (typeof record.id === 'string' && ids.has(record.id)) return null;
    if (typeof record.key === 'string' && keys.has(record.key)) return null;
    // Preserve valid rich text while removing both link target and its potentially secret label.
    if (
      ['text', 'inlineCard', 'blockCard', 'issue', 'mention'].includes(String(record.type)) &&
      mentions(JSON.stringify(record))
    )
      return { type: 'text', text: '[Restricted issue reference]' };
    // A link's label belongs to its target; masking only the URL leaks the title.
    if (
      ['url', 'href'].some(
        (field) => typeof record[field] === 'string' && mentions(record[field] as string),
      )
    )
      return null;
    return Object.fromEntries(Object.entries(record).map(([key, field]) => [key, visit(field)]));
  };
  return visit(value);
}
