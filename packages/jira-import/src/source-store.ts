import { createHash } from 'crypto';
import { In, type EntityManager } from 'typeorm';
import { ImportedAudienceEntity, ImportedPersonEntity, ImportedResourceEntity } from '@weaver/db';
import type { ImportedVisibility } from '@weaver/db';
import type { JiraComment, JiraUser } from './types';

export function sourceVisibility(source: string, value: unknown): ImportedVisibility | null {
  if (value === null || value === undefined) return null;
  const v = value as Record<string, unknown>;
  const type = ['group', 'role'].includes(String(v.type)) ? String(v.type) : 'unknown';
  const identifier = String(
    v.identifier ?? v.value ?? createHash('sha256').update(JSON.stringify(value)).digest('hex'),
  );
  return { sourceInstance: source, type, identifier, value: String(v.value ?? identifier) };
}

export function commentVisibility(
  source: string,
  comment: JiraComment,
  comments: ReadonlyMap<string, JiraComment>,
  seen = new Set<string>(),
): ImportedVisibility | null {
  if (seen.has(comment.id))
    return sourceVisibility(source, { type: 'unknown', value: 'Cyclic comment ancestry' });
  seen.add(comment.id);
  const own = sourceVisibility(source, comment.visibility);
  if (!comment.parentId) return own;
  const parent = comments.get(String(comment.parentId));
  if (!parent)
    return sourceVisibility(source, { type: 'unknown', value: 'Parent comment unavailable' });
  const inherited = commentVisibility(source, parent, comments, seen);
  if (
    own &&
    inherited &&
    (own.type !== inherited.type || own.identifier !== inherited.identifier)
  ) {
    return sourceVisibility(source, { type: 'unknown', value: 'Conflicting inherited visibility' });
  }
  return inherited ?? own;
}

export async function canReadImportedVisibility(
  manager: EntityManager,
  visibility: ImportedVisibility | null | undefined,
  user?: { userId: string; role: string },
): Promise<boolean> {
  if (!visibility) return true;
  if (!user) return false;
  if (user.role === 'owner' || user.role === 'admin') return true;
  if (!['role', 'group'].includes(visibility.type)) return false;
  const audience = await manager.getRepository(ImportedAudienceEntity).findOneBy({
    sourceInstance: visibility.sourceInstance,
    kind: visibility.type,
    identifier: visibility.identifier,
  });
  return Boolean(audience?.userIds.includes(user.userId));
}

export class SourceStore {
  constructor(
    readonly manager: EntityManager,
    readonly source: string,
    readonly jobId: string,
  ) {}

  async person(
    user: JiraUser | undefined | null,
    projectId: string,
    missingId: string,
  ): Promise<string> {
    const externalId = user?.accountId ?? user?.key ?? user?.name ?? `missing:${missingId}`;
    return this.manager.transaction(async (em) => {
      const repo = em.getRepository(ImportedPersonEntity);
      let person = await repo
        .createQueryBuilder('person')
        .where('person.source_instance = :source AND person.external_id = :externalId', {
          source: this.source,
          externalId,
        })
        .setLock('pessimistic_write')
        .getOne();
      if (!person)
        person = repo.create({
          sourceInstance: this.source,
          externalId,
          linkedUserId: null,
          projectIds: [],
        });
      // A mention can carry less profile data than the full account. Do not erase it.
      if (user?.displayName) person.displayName = user.displayName.replace(/^@/, '').slice(0, 255);
      person.displayName ||= 'Former Jira user';
      if (user?.emailAddress) person.email = user.emailAddress.trim().toLowerCase();
      person.email ??= null;
      person.sourceActive = user?.active ?? person.sourceActive ?? false;
      person.accountType =
        user?.accountType ?? person.accountType ?? (user ? 'atlassian' : 'unknown');
      person.projectIds = [...new Set([...person.projectIds, projectId])];
      const saved = await repo.save(person);
      return saved.linkedUserId ?? saved.id;
    });
  }

  async mentions(body: unknown, projectId: string): Promise<Map<string, string>> {
    const users = new Map<string, JiraUser>();
    const walk = (v: any) => {
      if (!v || typeof v !== 'object') return;
      if (v.type === 'mention' && v.attrs?.id)
        users.set(String(v.attrs.id), { accountId: String(v.attrs.id), displayName: v.attrs.text });
      if (Array.isArray(v.content)) v.content.forEach(walk);
    };
    walk(body);
    const result = new Map<string, string>();
    for (const [id, user] of users) result.set(id, await this.person(user, projectId, id));
    return result;
  }

  async audience(visibility: ImportedVisibility | null): Promise<void> {
    if (!visibility) return;
    const repo = this.manager.getRepository(ImportedAudienceEntity);
    if (
      await repo.findOneBy({
        sourceInstance: this.source,
        kind: visibility.type,
        identifier: visibility.identifier,
      })
    )
      return;
    await repo.save(
      repo.create({
        sourceInstance: this.source,
        kind: visibility.type,
        identifier: visibility.identifier,
        name: visibility.value,
        userIds: [],
      }),
    );
  }

  async resource(
    kind: string,
    externalId: string,
    projectId: string,
    payload: Record<string, any>,
    issueId: string | null = null,
    visibility: ImportedVisibility | null = null,
    nativeSnapshot: Record<string, any> | null = null,
  ): Promise<ImportedResourceEntity> {
    await this.audience(visibility);
    const repo = this.manager.getRepository(ImportedResourceEntity);
    const existing = await repo.findOneBy({ sourceInstance: this.source, kind, externalId });
    return repo.save(
      repo.create({
        ...existing,
        sourceInstance: this.source,
        kind,
        externalId,
        projectId,
        issueId,
        importJobId: this.jobId,
        payload,
        visibility,
        nativeSnapshot,
      }),
    );
  }
}

/** Call only with principals from resources the caller is allowed to read. */
export async function attributionNames(
  manager: EntityManager,
  ids: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (!unique.length) return new Map();
  const users: Array<{ id: string; display_name: string; email: string }> = await manager.query(
    'SELECT id, display_name, email FROM public.users WHERE id = ANY($1::uuid[])',
    [unique],
  );
  const people = await manager.getRepository(ImportedPersonEntity).findBy({ id: In(unique) });
  return new Map([
    ...users.map((user): [string, string] => [user.id, user.display_name || user.email]),
    ...people.map((person): [string, string] => [person.id, person.displayName]),
  ]);
}
