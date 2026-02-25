import {
  Controller,
  Get,
  Param,
  Query,
  NotFoundException,
} from '@nestjs/common';
import { TenantService } from '../../core/tenant/tenant.service';
import { TenantConnectionProvider } from '../../core/tenant/tenant-connection.provider';
import { tenantStorage } from '../../core/tenant/tenant.context';
import { ProjectEntity, IssueEntity, WorkflowStatusEntity } from '@weaver/db';
import { parsePagination, paginate } from '../../common';

@Controller('public')
export class PublicProjectsController {
  constructor(
    private readonly tenantService: TenantService,
    private readonly tenantConnections: TenantConnectionProvider,
  ) {}

  private async withTenant<T>(slug: string, fn: () => Promise<T>): Promise<T> {
    const tenant = await this.tenantService.findBySlug(slug);
    if (!tenant) throw new NotFoundException('Organization not found');

    return new Promise((resolve, reject) => {
      tenantStorage.run(
        { tenantId: tenant.id, schemaName: tenant.schemaName },
        () => fn().then(resolve).catch(reject),
      );
    });
  }

  @Get(':tenantSlug/projects')
  async listPublicProjects(
    @Param('tenantSlug') slug: string,
    @Query() query: any,
  ) {
    return this.withTenant(slug, async () => {
      const em = await this.tenantConnections.getEntityManager();
      const repo = em.getRepository(ProjectEntity);
      const qb = repo.createQueryBuilder('project')
        .where('project.visibility = :vis', { vis: 'public' })
        .orderBy('project.name', 'ASC');

      const params = parsePagination(query);
      return paginate(qb, params, ['name', 'createdAt']);
    });
  }

  @Get(':tenantSlug/projects/:key')
  async getPublicProject(
    @Param('tenantSlug') slug: string,
    @Param('key') key: string,
  ) {
    return this.withTenant(slug, async () => {
      const em = await this.tenantConnections.getEntityManager();
      const repo = em.getRepository(ProjectEntity);
      const project = await repo.findOneBy({ key, visibility: 'public' });
      if (!project) throw new NotFoundException('Project not found');
      return project;
    });
  }

  @Get(':tenantSlug/projects/:key/issues')
  async getPublicProjectIssues(
    @Param('tenantSlug') slug: string,
    @Param('key') key: string,
    @Query() query: any,
  ) {
    return this.withTenant(slug, async () => {
      const em = await this.tenantConnections.getEntityManager();
      const project = await em.getRepository(ProjectEntity).findOneBy({ key, visibility: 'public' });
      if (!project) throw new NotFoundException('Project not found');

      const qb = em.getRepository(IssueEntity)
        .createQueryBuilder('issue')
        .leftJoinAndSelect('issue.issueType', 'issueType')
        .where('issue.projectId = :pid', { pid: project.id })
        .orderBy('issue.createdAt', 'DESC');

      const params = parsePagination(query);
      return paginate(qb, params, ['createdAt', 'priority', 'summary']);
    });
  }

  @Get(':tenantSlug/projects/:key/board')
  async getPublicProjectBoard(
    @Param('tenantSlug') slug: string,
    @Param('key') key: string,
  ) {
    return this.withTenant(slug, async () => {
      const em = await this.tenantConnections.getEntityManager();
      const project = await em.getRepository(ProjectEntity).findOneBy({ key, visibility: 'public' });
      if (!project) throw new NotFoundException('Project not found');

      const issues = await em.getRepository(IssueEntity).find({
        where: { projectId: project.id },
        order: { sortOrder: 'ASC' },
      });

      let statuses: WorkflowStatusEntity[] = [];
      if (project.workflowId) {
        statuses = await em.getRepository(WorkflowStatusEntity).find({
          where: { workflowId: project.workflowId },
          order: { position: 'ASC' },
        });
      }

      return { issues, statuses };
    });
  }
}
