import { Controller, Get, UseGuards } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { CurrentUser, type RequestUser } from '../auth/current-user.decorator';
import { TenantConnectionProvider } from './tenant-connection.provider';
import { requireTenantContext } from './tenant.context';

/** Content-free cache version also catches worker imports and changes made by another API replica. */
@Controller('access-revision')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class AccessRevisionController {
  constructor(private readonly connections: TenantConnectionProvider) {}
  @Get()
  async get(@CurrentUser() user: RequestUser) {
    const em = await this.connections.getEntityManager();
    const schema = em.connection.driver.escape(requireTenantContext().schemaName);
    const rows = await em.query(
      `SELECT scope, state FROM (
      SELECT 'policy:' || id AS scope, jsonb_build_array(revision, reviewed, user_ids)::text AS state FROM ${schema}.issue_access_policies
      UNION ALL SELECT 'issue:' || id, jsonb_build_array(access_state, access_policy_id)::text FROM ${schema}.issues WHERE access_state <> 'unrestricted'
      UNION ALL SELECT 'project:' || id, jsonb_build_array(visibility, import_quarantined)::text FROM ${schema}.projects
      UNION ALL SELECT 'membership:' || project_id, role FROM ${schema}.project_members WHERE user_id = $1
      UNION ALL SELECT 'file:' || id, visibility::text FROM ${schema}.attachments WHERE visibility IS NOT NULL
      UNION ALL SELECT 'audience:' || id, user_ids::text FROM ${schema}.imported_audiences
    ) access_state ORDER BY scope`,
      [user.userId],
    );
    return {
      revision: createHash('sha256')
        .update(JSON.stringify([user.role, rows]))
        .digest('hex'),
    };
  }
}
