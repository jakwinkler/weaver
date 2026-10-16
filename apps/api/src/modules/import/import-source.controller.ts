import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ImportedPersonEntity, ImportedResourceEntity, IssueEntity } from '@weaver/db';
import { canReadImportedVisibility, FieldMapper } from '@weaver/jira-import';
import {
  CurrentUser,
  JwtAuthGuard,
  PermissionGuard,
  RequirePermission,
  RequestUser,
} from '../../core/auth';
import {
  ProjectAccessGuard,
  RequireProjectAccess,
  TenantConnectionProvider,
} from '../../core/tenant';

@Controller('issues/:issueKey/jira')
@UseGuards(JwtAuthGuard, PermissionGuard, ProjectAccessGuard)
export class ImportSourceController {
  constructor(private readonly connections: TenantConnectionProvider) {}
  @Get()
  @RequirePermission('issues', 'read')
  @RequireProjectAccess('issue-key')
  async details(@Param('issueKey') key: string, @CurrentUser() user: RequestUser) {
    const em = await this.connections.getEntityManager();
    const issue = await em.getRepository(IssueEntity).findOneByOrFail({ key });
    const resources = await em
      .getRepository(ImportedResourceEntity)
      .find({ where: { issueId: issue.id }, order: { updatedAt: 'ASC' } });
    const original = resources.find((v) => v.kind === 'issue');
    if (!original) return null;
    const fields = original.payload.fields ?? {};
    const people = await em
      .getRepository(ImportedPersonEntity)
      .findBy({ sourceInstance: original.sourceInstance });
    const name = (account: any) =>
      people.find((v) => v.externalId === (account?.accountId ?? account?.key ?? account?.name))
        ?.displayName ??
      account?.displayName ??
      'Former Jira user';
    const mapper = new FieldMapper();
    const worklogs = [];
    for (const resource of resources.filter((v) => v.kind === 'worklog')) {
      if (!(await canReadImportedVisibility(em, resource.visibility, user))) continue;
      const value = resource.payload;
      worklogs.push({
        id: value.id,
        author: name(value.author),
        started: value.started,
        seconds: value.timeSpentSeconds,
        body: mapper.mapDescription(value.comment),
        visibility: resource.visibility,
      });
    }
    return {
      originalKey: original.payload.key,
      sourceUrl: `${original.sourceInstance}/browse/${encodeURIComponent(original.payload.key)}`,
      fixVersions: fields.fixVersions ?? [],
      affectedVersions: fields.versions ?? [],
      components: fields.components ?? [],
      creator: name(fields.creator),
      resolution: fields.resolution?.name ?? null,
      resolvedAt: fields.resolutiondate ?? null,
      originalEstimateSeconds: fields.timeoriginalestimate ?? null,
      remainingEstimateSeconds: fields.timeestimate ?? null,
      worklogs,
      history: resources
        .filter((v) => v.kind === 'changelog')
        .map((v) => ({
          id: v.payload.id,
          author: name(v.payload.author),
          created: v.payload.created,
          items: (v.payload.items ?? []).map((item: any) => ({
            field: item.field,
            from: item.fromString,
            to: item.toString,
          })),
        })),
      links: resources
        .filter((v) => v.kind === 'remote_link')
        .map((v) => ({
          id: v.payload.id,
          title: v.payload.object?.title,
          url: v.payload.object?.url,
        })),
    };
  }
}
