import type { TenantMembershipEntity, UserEntity } from '@weaver/db';
import type { Repository } from 'typeorm';

/**
 * Access and refresh tokens carry the account's session version from when they were issued.
 * A password reset raises the account's version, so every earlier token stops working at
 * once instead of when it expires. Tokens issued before versions existed count as 0.
 */
export function tokenSessionVersion(payload: { sessionVersion?: unknown }): number {
  return typeof payload.sessionVersion === 'number' ? payload.sessionVersion : 0;
}

const KNOWN_VERSION = Symbol('weaver.sessionVersion');

type VersionCarrier = { [KNOWN_VERSION]?: { userId: string; sessionVersion: number } };

/** Records the account's current version on the request so later checks need no query. */
export function rememberSessionVersion(req: object, userId: string, sessionVersion: number): void {
  (req as VersionCarrier)[KNOWN_VERSION] = { userId, sessionVersion };
}

/** The account's current version, read at most once per request; undefined if it is gone. */
export async function currentSessionVersion(
  req: object,
  userId: string,
  users: Repository<UserEntity>,
): Promise<number | undefined> {
  const known = (req as VersionCarrier)[KNOWN_VERSION];
  if (known?.userId === userId) return known.sessionVersion;
  const user = await users.findOne({
    where: { id: userId },
    select: { id: true, sessionVersion: true },
  });
  if (!user) return undefined;
  rememberSessionVersion(req, userId, user.sessionVersion);
  return user.sessionVersion;
}

/**
 * One query for everything a signed-in request needs: the membership's role, the tenant's
 * schema, and the account's session version.
 */
export function findMembershipSession(
  memberships: Repository<TenantMembershipEntity>,
  tenantId: string | undefined,
  userId: string | undefined,
): Promise<TenantMembershipEntity | null> {
  // An undefined value would drop that condition from the query and match another membership.
  if (!tenantId || !userId) return Promise.resolve(null);
  return memberships.findOne({
    where: { tenantId, userId },
    relations: { tenant: true, user: true },
    select: {
      tenantId: true,
      userId: true,
      role: true,
      tenant: { id: true, schemaName: true },
      user: { id: true, sessionVersion: true },
    },
  });
}
