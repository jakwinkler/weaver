import { WeaverGateway } from '../../core/websocket';
import {
  Body,
  ConflictException,
  Controller,
  Get,
  BadRequestException,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  AuditLogEntity,
  IssueAccessPolicyEntity,
  IssueEntity,
  ProjectEntity,
  ProjectMemberEntity,
} from '@weaver/db';
import { z } from 'zod';
import { AdminGuard, CurrentUser, JwtAuthGuard, type RequestUser } from '../../core/auth';
import { TenantConnectionProvider, requireTenantContext } from '../../core/tenant';

@Controller('import/issue-security')
@UseGuards(JwtAuthGuard, AdminGuard)
export class IssueSecurityController {
  constructor(
    private readonly connections: TenantConnectionProvider,
    private readonly gateway: WeaverGateway,
  ) {}

  @Get()
  async list() {
    const em = await this.connections.getEntityManager();
    const policies = await em
      .getRepository(IssueAccessPolicyEntity)
      .find({ order: { name: 'ASC' } });
    const result = [];
    for (const policy of policies) {
      const project = await em
        .getRepository(ProjectEntity)
        .findOneByOrFail({ id: policy.projectId });
      const members = await em
        .getRepository(ProjectMemberEntity)
        .findBy({ projectId: policy.projectId });
      result.push({
        ...policy,
        projectName: project.name,
        projectKey: project.key,
        projectMemberIds: members.map((m) => m.userId),
        affectedCount: await em.getRepository(IssueEntity).countBy({ accessPolicyId: policy.id }),
      });
    }
    const pending = await em.getRepository(IssueEntity).find({
      where: { accessState: 'quarantined' },
      select: ['id', 'key', 'summary', 'sourceSecurity', 'accessPolicyId', 'updatedAt'],
    });
    return { policies: result, pending };
  }

  @Post(':id')
  async map(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() user: RequestUser,
  ) {
    const parsed = z
      .object({
        userIds: z.array(z.string().uuid()).max(1000),
        revision: z.number().int().positive(),
        affectedCount: z.number().int().nonnegative(),
      })
      .safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid access review');
    const input = parsed.data;
    const { tenantId } = requireTenantContext();
    return this.connections.runInTenantTransaction(async (em) => {
      const [lock] = await em.query('SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked', [
        `${tenantId}:jira-import`,
      ]);
      if (!lock.locked)
        throw new ConflictException('Finish or cancel the import before reviewing access');
      const repo = em.getRepository(IssueAccessPolicyEntity);
      const policy = await repo.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!policy || policy.revision !== input.revision)
        throw new ConflictException('The policy changed; review it again');
      const affectedCount = await em.getRepository(IssueEntity).countBy({ accessPolicyId: id });
      if (affectedCount !== input.affectedCount)
        throw new ConflictException('The affected issues changed; review again');
      const userIds = [...new Set(input.userIds)];
      const members = await em.query(
        'SELECT user_id FROM public.tenant_memberships WHERE tenant_id = $1 AND user_id = ANY($2::uuid[])',
        [tenantId, userIds],
      );
      if (members.length !== userIds.length)
        throw new BadRequestException('Select active organization members');
      const previousUserIds = policy.userIds;
      Object.assign(policy, {
        userIds,
        reviewed: true,
        revision: policy.revision + 1,
        reviewedBy: user.userId,
        reviewedAt: new Date(),
      });
      await repo.save(policy);
      await em.getRepository(AuditLogEntity).save({
        userId: user.userId,
        action: 'import.issue_security_mapped',
        resource: 'import',
        resourceId: id,
        metadata: { previousUserIds, userIds, affectedCount, revision: policy.revision },
      });
      this.connections.deferUntilCommit(async () => {
        for (const userId of new Set([...previousUserIds, ...userIds]))
          this.gateway.emitToUser(tenantId, userId, 'access:changed', {});
      });
      return { id, previousUserIds, userIds, affectedCount, revision: policy.revision };
    });
  }

  @Post('issues/:id/review')
  async review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() user: RequestUser,
  ) {
    const parsed = z
      .object({ updatedAt: z.string().datetime(), levelId: z.string().nullable() })
      .safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid access review');
    const input = parsed.data;
    const { tenantId } = requireTenantContext();
    return this.connections.runInTenantTransaction(async (em) => {
      const [lock] = await em.query('SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked', [
        `${tenantId}:jira-import`,
      ]);
      if (!lock.locked)
        throw new ConflictException('Finish or cancel the import before reviewing access');
      const repo = em.getRepository(IssueEntity);
      const issue = await repo.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (
        !issue ||
        issue.accessState !== 'quarantined' ||
        !issue.sourceSecurity?.verified ||
        issue.updatedAt.toISOString() !== input.updatedAt ||
        issue.sourceSecurity.levelId !== input.levelId
      )
        throw new ConflictException(
          'Source access changed or is unverified; reimport and review again',
        );
      if (
        input.levelId &&
        (!issue.accessPolicyId ||
          !(await em
            .getRepository(IssueAccessPolicyEntity)
            .existsBy({ id: issue.accessPolicyId, reviewed: true, projectId: issue.projectId })))
      )
        throw new BadRequestException('Review the destination security-level audience first');
      await repo.update(id, { accessState: input.levelId ? 'restricted' : 'unrestricted' });
      await em.getRepository(AuditLogEntity).save({
        userId: user.userId,
        action: 'import.issue_security_change_reviewed',
        resource: 'import',
        resourceId: id,
        metadata: { previousState: 'quarantined', levelId: input.levelId },
      });
      const members = await em.query(
        'SELECT user_id FROM public.tenant_memberships WHERE tenant_id = $1',
        [tenantId],
      );
      this.connections.deferUntilCommit(async () => {
        for (const member of members)
          this.gateway.emitToUser(tenantId, member.user_id, 'access:changed', {});
      });
      return {
        id,
        previousState: 'quarantined',
        state: input.levelId ? 'restricted' : 'unrestricted',
      };
    });
  }
}
