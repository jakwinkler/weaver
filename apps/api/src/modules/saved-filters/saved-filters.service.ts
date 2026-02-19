import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { SavedFilterEntity } from '@weaver/db';
import { TenantConnectionProvider } from '../../core/tenant';

@Injectable()
export class SavedFiltersService {
  constructor(private readonly tenantConnections: TenantConnectionProvider) {}

  async findByUser(userId: string): Promise<SavedFilterEntity[]> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(SavedFilterEntity);

    return repo.find({
      where: { ownerId: userId },
      order: { name: 'ASC' },
    });
  }

  async findShared(): Promise<SavedFilterEntity[]> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(SavedFilterEntity);

    return repo.find({
      where: { isShared: true },
      order: { name: 'ASC' },
    });
  }

  async findAllForUser(userId: string): Promise<SavedFilterEntity[]> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(SavedFilterEntity);

    return repo
      .createQueryBuilder('f')
      .where('f.owner_id = :userId OR f.is_shared = true', { userId })
      .orderBy('f.name', 'ASC')
      .getMany();
  }

  async findById(id: string): Promise<SavedFilterEntity> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(SavedFilterEntity);
    const filter = await repo.findOneBy({ id });
    if (!filter) {
      throw new NotFoundException(`Saved filter "${id}" not found`);
    }
    return filter;
  }

  async create(
    dto: { name: string; query: string; isShared: boolean },
    ownerId: string,
  ): Promise<SavedFilterEntity> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(SavedFilterEntity);

    const filter = repo.create({
      name: dto.name,
      query: dto.query,
      isShared: dto.isShared,
      ownerId,
    });

    return repo.save(filter);
  }

  async update(
    id: string,
    dto: Partial<{ name: string; query: string; isShared: boolean }>,
    userId: string,
  ): Promise<SavedFilterEntity> {
    const filter = await this.findById(id);
    if (filter.ownerId !== userId) {
      throw new ForbiddenException('You can only update your own saved filters');
    }

    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(SavedFilterEntity);

    Object.assign(filter, dto);
    return repo.save(filter);
  }

  async delete(id: string, userId: string): Promise<void> {
    const filter = await this.findById(id);
    if (filter.ownerId !== userId) {
      throw new ForbiddenException('You can only delete your own saved filters');
    }

    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(SavedFilterEntity);
    await repo.remove(filter);
  }
}
