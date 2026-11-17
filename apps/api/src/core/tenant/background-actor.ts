import type { EntityManager } from 'typeorm';
import type { RequestUser } from '../auth/current-user.decorator';
import { requireTenantContext } from './tenant.context';

/** Resolve current membership at execution time, never a role saved in a queued job. */
export async function backgroundActor(
  em: EntityManager,
  userId: string,
): Promise<RequestUser | undefined> {
  const { tenantId } = requireTenantContext();
  const [member] = await em.query(
    `SELECT membership.role, account.email
       FROM public.tenant_memberships membership
       JOIN public.users account ON account.id = membership.user_id
      WHERE membership.tenant_id = $1 AND membership.user_id = $2`,
    [tenantId, userId],
  );
  if (!member) return undefined;
  return { userId, tenantId, role: member.role, email: member.email };
}
