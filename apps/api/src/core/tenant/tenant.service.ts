import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { TenantEntity } from '@weaver/db';
import type { TenantSettings } from '@weaver/shared';

const DEFAULT_SETTINGS: TenantSettings = {
  timezone: 'UTC',
  theme: 'system',
  allowedDomains: [],
  smtp: null,
};

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
  }, manager?: EntityManager): Promise<TenantEntity> {
    const repo = manager
      ? manager.getRepository(TenantEntity)
      : this.tenantRepo;
    const schemaName = `tenant_${data.slug.replace(/-/g, '_')}`;

    const tenant = repo.create({
      name: data.name,
      slug: data.slug,
      schemaName,
      plan: 'free',
      settings: {},
    });

    return repo.save(tenant);
  }

  async findAll(): Promise<TenantEntity[]> {
    return this.tenantRepo.find();
  }

  async getSettings(tenantId: string): Promise<TenantSettings> {
    const tenant = await this.tenantRepo.findOneByOrFail({ id: tenantId });
    return { ...DEFAULT_SETTINGS, ...(tenant.settings as Partial<TenantSettings>) };
  }

  async updateSettings(tenantId: string, partial: Partial<TenantSettings>): Promise<TenantSettings> {
    const tenant = await this.tenantRepo.findOneByOrFail({ id: tenantId });
    const merged = { ...DEFAULT_SETTINGS, ...(tenant.settings as Partial<TenantSettings>), ...partial };
    tenant.settings = merged as unknown as Record<string, unknown>;
    await this.tenantRepo.save(tenant);
    return merged;
  }
}
