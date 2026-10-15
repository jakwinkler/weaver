import { Controller, Get, Param, Query, NotFoundException } from '@nestjs/common';
import { TenantService } from '../../core/tenant/tenant.service';
import { TenantConnectionProvider } from '../../core/tenant/tenant-connection.provider';
import { tenantStorage } from '../../core/tenant/tenant.context';
import { ProjectEntity, IssueEntity, WorkflowStatusEntity } from '@weaver/db';
import type { PublicProject, PublicIssue, PublicBoardData } from '@weaver/shared';
import { parsePagination, paginate } from '../../common';

const projectColumns = ['project.id', 'project.key', 'project.name', 'project.description'];
const issueColumns = ['issue.id', 'issue.key', 'issue.summary', 'issue.statusId', 'issue.priority'];
const publicProject = ({ id, key, name, description }: ProjectEntity): PublicProject => ({
  id,
  key,
  name,
  description,
});
const publicIssue = ({ id, key, summary, statusId, priority }: IssueEntity): PublicIssue => ({
  id,
  key,
  summary,
  statusId,
  priority,
});

@Controller('public')
export class PublicProjectsController {
  constructor(
    private readonly tenantService: TenantService,
    private readonly tenantConnections: TenantConnectionProvider,
  ) {}

  private async withTenant<T>(slug: string, fn: () => Promise<T>): Promise<T> {
    const tenant = await this.tenantService.findBySlug(slug);
    if (!tenant) throw new NotFoundException('Organization not found');
    return tenantStorage.run({ tenantId: tenant.id, schemaName: tenant.schemaName }, fn);
  }

  @Get(':tenantSlug/projects')
  async listPublicProjects(
    @Param('tenantSlug') slug: string,
    @Query() query: Record<string, unknown>,
  ) {
    const params = parsePagination(query);
    return this.withTenant(slug, async () => {
      const em = await this.tenantConnections.getEntityManager();
      const qb = em
        .getRepository(ProjectEntity)
        .createQueryBuilder('project')
        .select(projectColumns)
        .where('project.visibility = :vis', { vis: 'public' })
        .orderBy('project.name', 'ASC');
      const result = await paginate(qb, params, ['name', 'createdAt']);
      return { ...result, data: result.data.map(publicProject) };
    });
  }

  @Get(':tenantSlug/projects/:key')
  async getPublicProject(@Param('tenantSlug') slug: string, @Param('key') key: string) {
    return this.withTenant(slug, async () => {
      const em = await this.tenantConnections.getEntityManager();
      const project = await em.getRepository(ProjectEntity).findOne({
        where: { key, visibility: 'public' },
        select: { id: true, key: true, name: true, description: true },
      });
      if (!project) throw new NotFoundException('Project not found');
      return publicProject(project);
    });
  }

  @Get(':tenantSlug/projects/:key/issues')
  async getPublicProjectIssues(
    @Param('tenantSlug') slug: string,
    @Param('key') key: string,
    @Query() query: Record<string, unknown>,
  ) {
    const params = parsePagination(query);
    return this.withTenant(slug, async () => {
      const em = await this.tenantConnections.getEntityManager();
      const project = await em
        .getRepository(ProjectEntity)
        .findOne({ where: { key, visibility: 'public' }, select: { id: true } });
      if (!project) throw new NotFoundException('Project not found');
      const qb = em
        .getRepository(IssueEntity)
        .createQueryBuilder('issue')
        .select(issueColumns)
        .where('issue.projectId = :pid', { pid: project.id })
        .orderBy('issue.createdAt', 'DESC');
      const result = await paginate(qb, params, ['createdAt', 'priority', 'summary']);
      return { ...result, data: result.data.map(publicIssue) };
    });
  }

  @Get(':tenantSlug/projects/:key/board')
  async getPublicProjectBoard(
    @Param('tenantSlug') slug: string,
    @Param('key') key: string,
    @Query() query: Record<string, unknown>,
  ): Promise<PublicBoardData> {
    const params = parsePagination(query);
    return this.withTenant(slug, async () => {
      const em = await this.tenantConnections.getEntityManager();
      const project = await em
        .getRepository(ProjectEntity)
        .findOne({ where: { key, visibility: 'public' }, select: { id: true, workflowId: true } });
      if (!project) throw new NotFoundException('Project not found');
      const qb = em
        .getRepository(IssueEntity)
        .createQueryBuilder('issue')
        .select(issueColumns)
        .where('issue.projectId = :pid', { pid: project.id })
        .orderBy('issue.sortOrder', 'ASC');
      const result = await paginate(qb, params, ['sortOrder', 'createdAt', 'priority', 'summary']);
      const statuses = project.workflowId
        ? await em.getRepository(WorkflowStatusEntity).find({
            where: { workflowId: project.workflowId },
            order: { position: 'ASC' },
            select: { id: true, name: true, color: true, position: true },
          })
        : [];
      return {
        issues: result.data.map(publicIssue),
        meta: result.meta,
        statuses: statuses.map(({ id, name, color, position }) => ({ id, name, color, position })),
      };
    });
  }
}
