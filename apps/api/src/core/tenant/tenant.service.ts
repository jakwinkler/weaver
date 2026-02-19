import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantEntity } from '@weaver/db';

@Injectable()
export class TenantService {
  constructor(
    @InjectRepository(TenantEntity)
    private readonly tenantRepo: Repository<TenantEntity>,
  ) {}

  async findById(id: string): Promise<TenantEntity | null> {
    return this.tenantRepo.findOneBy({ id });
  }

  async findBySlug(slug: string): Promise<TenantEntity | null> {
    return this.tenantRepo.findOneBy({ slug });
  }

  async create(data: {
    name: string;
    slug: string;
  }): Promise<TenantEntity> {
    const schemaName = `tenant_${data.slug.replace(/-/g, '_')}`;

    const tenant = this.tenantRepo.create({
      name: data.name,
      slug: data.slug,
      schemaName,
      plan: 'free',
      settings: {},
    });

    return this.tenantRepo.save(tenant);
  }

  async findAll(): Promise<TenantEntity[]> {
    return this.tenantRepo.find();
  }
}
