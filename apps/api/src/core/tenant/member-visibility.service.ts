import { ForbiddenException, Injectable } from '@nestjs/common';
import type { RequestUser } from '../auth/current-user.decorator';
import { TenantConnectionProvider } from './tenant-connection.provider';
import { requireTenantContext } from './tenant.context';

@Injectable()
export class MemberVisibilityService {
  constructor(private readonly tenantConnections: TenantConnectionProvider) {}

  // null represents the agency's complete organization directory.
  async visibleMemberIds(user: RequestUser): Promise<string[] | null> {
    if (user.role === 'owner' || user.role === 'admin') return null;
    const em = await this.tenantConnections.getEntityManager();
    const schema = em.connection.driver.escape(requireTenantContext().schemaName);
    const colleagues: { id: string }[] = await em.query(
      `SELECT DISTINCT colleague.user_id AS id FROM ${schema}.project_members colleague
       JOIN ${schema}.project_members mine ON mine.project_id = colleague.project_id
       JOIN public.tenant_memberships member ON member.user_id = colleague.user_id AND member.tenant_id = $1
       WHERE mine.user_id = $2`, [user.tenantId, user.userId],
    );
    return [...new Set([user.userId, ...colleagues.map(({ id }) => id)])];
  }

  async assertVisibleMember(user: RequestUser, selectedId?: string | null): Promise<void> {
    if (!selectedId) return;
    const visible = await this.visibleMemberIds(user);
    if (visible?.includes(selectedId)) return;
    if (visible === null) {
      const em = await this.tenantConnections.getEntityManager();
      const rows = await em.query('SELECT 1 FROM public.tenant_memberships WHERE tenant_id = $1 AND user_id = $2', [user.tenantId, selectedId]);
      if (rows.length) return;
    }
    throw new ForbiddenException('Selected person is not available');
  }

  async projectRecipientIds(tenantId: string, projectId: string, userIds: string[]): Promise<Set<string>> {
    if (!userIds.length) return new Set();
    const em = await this.tenantConnections.getEntityManager();
    const schema = em.connection.driver.escape(requireTenantContext().schemaName);
    const rows: { id: string }[] = await em.query(
      `SELECT m.user_id AS id FROM public.tenant_memberships m
       WHERE m.tenant_id = $1 AND m.user_id = ANY($2::uuid[]) AND (
         m.role IN ('owner', 'admin') OR
         EXISTS (SELECT 1 FROM ${schema}.project_members p WHERE p.project_id = $3 AND p.user_id = m.user_id) OR
         EXISTS (SELECT 1 FROM ${schema}.projects p WHERE p.id = $3 AND p.visibility = 'public')
       )`, [tenantId, userIds, projectId],
    );
    return new Set(rows.map(({ id }) => id));
  }
}
