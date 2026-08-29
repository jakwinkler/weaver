import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  PageEntity,
  PageVersionEntity,
  ProjectEntity,
} from '@weaver/db';
import type {
  CreatePageDto,
  PageTreeNode,
  UpdatePageDto,
} from '@weaver/shared';
import { TenantConnectionProvider } from '../../core/tenant';
import { UsersService } from '../users';

@Injectable()
export class PagesService {
  constructor(
    private readonly tenantConnections: TenantConnectionProvider,
    private readonly usersService: UsersService,
  ) {}

  async create(
    projectKey: string,
    dto: CreatePageDto,
    userId: string,
  ): Promise<PageEntity> {
    const em = await this.tenantConnections.getEntityManager();
    const project = await this.findProject(projectKey, em);
    const repo = em.getRepository(PageEntity);

    if (dto.parentId) {
      await this.findParent(dto.parentId, project.id, em);
    }

    const page = repo.create({
      projectId: project.id,
      title: dto.title,
      slug: await this.uniqueSlug(project.id, dto.title, em),
      body: dto.body,
      parentId: dto.parentId ?? null,
      sortOrder: dto.sortOrder ?? await this.nextSortOrder(
        project.id,
        dto.parentId ?? null,
        em,
      ),
      createdBy: userId,
    });

    return repo.save(page);
  }

  async findAll(projectKey: string): Promise<PageEntity[]> {
    const em = await this.tenantConnections.getEntityManager();
    const project = await this.findProject(projectKey, em);
    return em.getRepository(PageEntity).find({
      where: { projectId: project.id },
      order: { sortOrder: 'ASC', title: 'ASC' },
    });
  }

  async getTree(projectKey: string): Promise<PageTreeNode[]> {
    const pages = await this.findAll(projectKey);
    const nodes = new Map<string, PageTreeNode>();

    for (const page of pages) {
      nodes.set(page.id, {
        id: page.id,
        title: page.title,
        slug: page.slug,
        parentId: page.parentId,
        sortOrder: page.sortOrder,
        children: [],
      });
    }

    const roots: PageTreeNode[] = [];
    for (const page of pages) {
      const node = nodes.get(page.id)!;
      const parent = page.parentId ? nodes.get(page.parentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }

    const sortNodes = (items: PageTreeNode[]) => {
      items.sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
      for (const item of items) sortNodes(item.children);
    };
    sortNodes(roots);
    return roots;
  }

  async findBySlug(projectKey: string, slug: string): Promise<PageEntity> {
    const em = await this.tenantConnections.getEntityManager();
    const project = await this.findProject(projectKey, em);
    return this.findPage(project.id, slug, em);
  }

  async search(projectKey: string, query: string): Promise<PageEntity[]> {
    const normalized = query.trim();
    if (!normalized) throw new BadRequestException('Search query is required');

    const em = await this.tenantConnections.getEntityManager();
    const project = await this.findProject(projectKey, em);

    return em.getRepository(PageEntity)
      .createQueryBuilder('page')
      .where('page.project_id = :projectId', { projectId: project.id })
      .andWhere(
        `to_tsvector('simple', coalesce(page.title, '') || ' ' || page.body::text)
         @@ websearch_to_tsquery('simple', :query)`,
        { query: normalized },
      )
      .orderBy(
        `ts_rank(
          to_tsvector('simple', coalesce(page.title, '') || ' ' || page.body::text),
          websearch_to_tsquery('simple', :query)
        )`,
        'DESC',
      )
      .addOrderBy('page.title', 'ASC')
      .setParameter('query', normalized)
      .take(50)
      .getMany();
  }

  async update(
    projectKey: string,
    slug: string,
    dto: UpdatePageDto,
    userId: string,
  ): Promise<PageEntity> {
    const em = await this.tenantConnections.getEntityManager();
    return em.transaction(async (transaction) => {
      const project = await this.findProject(projectKey, transaction);
      const page = await this.findPage(project.id, slug, transaction);
      const repo = transaction.getRepository(PageEntity);

      await this.storeVersion(page, userId, transaction);

      if (dto.parentId !== undefined && dto.parentId !== page.parentId) {
        if (dto.parentId === page.id) {
          throw new BadRequestException('A page cannot be its own parent');
        }
        if (dto.parentId) {
          const parent = await this.findParent(dto.parentId, project.id, transaction);
          await this.assertNoCycle(page.id, parent, transaction);
        }
        page.parentId = dto.parentId;
      }

      if (dto.title !== undefined && dto.title !== page.title) {
        page.title = dto.title;
        page.slug = await this.uniqueSlug(project.id, dto.title, transaction, page.id);
      }
      if (dto.body !== undefined) page.body = dto.body;
      if (dto.sortOrder !== undefined) page.sortOrder = dto.sortOrder;

      return repo.save(page);
    });
  }

  async delete(projectKey: string, slug: string): Promise<void> {
    const em = await this.tenantConnections.getEntityManager();
    await em.transaction(async (transaction) => {
      const project = await this.findProject(projectKey, transaction);
      const page = await this.findPage(project.id, slug, transaction);
      const repo = transaction.getRepository(PageEntity);

      await repo.update(
        { projectId: project.id, parentId: page.id },
        { parentId: page.parentId },
      );
      await repo.remove(page);
    });
  }

  async getHistory(projectKey: string, slug: string) {
    const em = await this.tenantConnections.getEntityManager();
    const project = await this.findProject(projectKey, em);
    const page = await this.findPage(project.id, slug, em);
    const versions = await em.getRepository(PageVersionEntity).find({
      where: { pageId: page.id },
      order: { createdAt: 'DESC' },
    });

    const authorNames = new Map<string, string>();
    await Promise.all([...new Set(versions.map((version) => version.createdBy))].map(async (id) => {
      try {
        const user = await this.usersService.findById(id);
        authorNames.set(id, user.displayName || user.email);
      } catch {
        authorNames.set(id, 'Unknown user');
      }
    }));

    return versions.map((version) => ({
      ...version,
      authorDisplayName: authorNames.get(version.createdBy) ?? 'Unknown user',
    }));
  }

  async restore(
    projectKey: string,
    slug: string,
    versionId: string,
    userId: string,
  ): Promise<PageEntity> {
    const em = await this.tenantConnections.getEntityManager();
    return em.transaction(async (transaction) => {
      const project = await this.findProject(projectKey, transaction);
      const page = await this.findPage(project.id, slug, transaction);
      const version = await transaction.getRepository(PageVersionEntity).findOneBy({
        id: versionId,
        pageId: page.id,
      });
      if (!version) throw new NotFoundException('Page version not found');

      await this.storeVersion(page, userId, transaction);

      if (version.parentId) {
        const parent = await this.findParent(version.parentId, project.id, transaction);
        await this.assertNoCycle(page.id, parent, transaction);
      }

      page.title = version.title;
      page.slug = await this.uniqueSlug(project.id, version.title, transaction, page.id);
      page.body = version.body;
      page.parentId = version.parentId;
      page.sortOrder = version.sortOrder;
      return transaction.getRepository(PageEntity).save(page);
    });
  }

  private async findProject(key: string, em: EntityManager): Promise<ProjectEntity> {
    const project = await em.getRepository(ProjectEntity).findOneBy({ key });
    if (!project) throw new NotFoundException(`Project "${key}" not found`);
    return project;
  }

  private async findPage(
    projectId: string,
    slug: string,
    em: EntityManager,
  ): Promise<PageEntity> {
    const page = await em.getRepository(PageEntity).findOneBy({ projectId, slug });
    if (!page) throw new NotFoundException(`Page "${slug}" not found`);
    return page;
  }

  private async findParent(
    id: string,
    projectId: string,
    em: EntityManager,
  ): Promise<PageEntity> {
    const parent = await em.getRepository(PageEntity).findOneBy({ id, projectId });
    if (!parent) throw new BadRequestException('Parent page not found in this project');
    return parent;
  }

  private async assertNoCycle(
    pageId: string,
    proposedParent: PageEntity,
    em: EntityManager,
  ): Promise<void> {
    let current: PageEntity | null = proposedParent;
    const repo = em.getRepository(PageEntity);
    while (current) {
      if (current.id === pageId) {
        throw new BadRequestException('Moving this page would create a cycle');
      }
      current = current.parentId ? await repo.findOneBy({ id: current.parentId }) : null;
    }
  }

  private async nextSortOrder(
    projectId: string,
    parentId: string | null,
    em: EntityManager,
  ): Promise<number> {
    const row = await em.getRepository(PageEntity)
      .createQueryBuilder('page')
      .select('MAX(page.sort_order)', 'max')
      .where('page.project_id = :projectId', { projectId })
      .andWhere(parentId === null ? 'page.parent_id IS NULL' : 'page.parent_id = :parentId', { parentId })
      .getRawOne<{ max: string | null }>();
    return row?.max === null || row?.max === undefined ? 0 : Number(row.max) + 1000;
  }

  private slugify(title: string): string {
    return title
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 240) || 'page';
  }

  private async uniqueSlug(
    projectId: string,
    title: string,
    em: EntityManager,
    excludeId?: string,
  ): Promise<string> {
    const base = this.slugify(title);
    const repo = em.getRepository(PageEntity);
    for (let suffix = 1; suffix <= 9999; suffix += 1) {
      const slug = suffix === 1 ? base : `${base}-${suffix}`;
      const existing = await repo.findOneBy({ projectId, slug });
      if (!existing || existing.id === excludeId) return slug;
    }
    throw new ConflictException('Could not generate a unique page slug');
  }

  private async storeVersion(
    page: PageEntity,
    userId: string,
    em: EntityManager,
  ): Promise<void> {
    const repo = em.getRepository(PageVersionEntity);
    await repo.save(repo.create({
      pageId: page.id,
      title: page.title,
      slug: page.slug,
      body: page.body,
      parentId: page.parentId,
      sortOrder: page.sortOrder,
      createdBy: userId,
    }));
  }
}
