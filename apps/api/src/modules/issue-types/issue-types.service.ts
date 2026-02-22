import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { IssueTypeEntity } from '@weaver/db';
import { TenantConnectionProvider } from '../../core/tenant';

@Injectable()
export class IssueTypesService {
  constructor(private readonly tenantConnections: TenantConnectionProvider) {}

  async create(dto: { name: string; slug: string; icon?: string | null; iconColor?: string | null; iconAttachmentId?: string | null; isSubtask?: boolean }): Promise<IssueTypeEntity> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(IssueTypeEntity);

    const existing = await repo.findOneBy({ slug: dto.slug });
    if (existing) {
      throw new ConflictException(`Issue type slug "${dto.slug}" already exists`);
    }

    const issueType = repo.create({
      name: dto.name,
      slug: dto.slug,
      icon: dto.icon ?? null,
      iconColor: dto.iconColor ?? null,
      iconAttachmentId: dto.iconAttachmentId ?? null,
      isSubtask: dto.isSubtask ?? false,
    });

    return repo.save(issueType);
  }

  async findAll(): Promise<IssueTypeEntity[]> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(IssueTypeEntity);
    return repo.find({ order: { name: 'ASC' } });
  }

  async findById(id: string): Promise<IssueTypeEntity> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(IssueTypeEntity);
    const issueType = await repo.findOneBy({ id });
    if (!issueType) {
      throw new NotFoundException(`Issue type "${id}" not found`);
    }
    return issueType;
  }

  async update(id: string, dto: { name?: string; slug?: string; icon?: string | null; iconColor?: string | null; iconAttachmentId?: string | null; isSubtask?: boolean }): Promise<IssueTypeEntity> {
    const issueType = await this.findById(id);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(IssueTypeEntity);

    if (dto.slug && dto.slug !== issueType.slug) {
      const existing = await repo.findOneBy({ slug: dto.slug });
      if (existing) {
        throw new ConflictException(`Issue type slug "${dto.slug}" already exists`);
      }
    }

    Object.assign(issueType, dto);
    return repo.save(issueType);
  }

  async delete(id: string): Promise<void> {
    const issueType = await this.findById(id);
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(IssueTypeEntity);
    await repo.remove(issueType);
  }
}
