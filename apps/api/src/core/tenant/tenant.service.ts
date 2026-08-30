import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantEntity } from '@weaver/db';
import type { TenantSettings } from '@weaver/shared';

const DEFAULT_SETTINGS: TenantSettings = {
  timezone: 'UTC',
  theme: 'system',
  allowedDomains: [],
  smtp: null,
  sso: {
    google: { enabled: true },
    github: { enabled: true },
    saml: { enabled: false, idpUrl: '', cert: '' },
    oidc: {
      enabled: false,
      discoveryUrl: '',
      clientId: '',
      clientSecret: '',
    },
  },
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

  async getSettings(tenantId: string): Promise<TenantSettings> {
    const tenant = await this.tenantRepo.findOneByOrFail({ id: tenantId });
    return this.mergeSettings(tenant.settings as Partial<TenantSettings>);
  }

  async updateSettings(tenantId: string, partial: Partial<TenantSettings>): Promise<TenantSettings> {
    const tenant = await this.tenantRepo.findOneByOrFail({ id: tenantId });
    const current = this.mergeSettings(tenant.settings as Partial<TenantSettings>);
    const merged = this.mergeSettings({
      ...current,
      ...partial,
      sso: partial.sso
        ? {
            ...current.sso,
            ...partial.sso,
            google: { ...current.sso.google, ...partial.sso.google },
            github: { ...current.sso.github, ...partial.sso.github },
            saml: { ...current.sso.saml, ...partial.sso.saml },
            oidc: { ...current.sso.oidc, ...partial.sso.oidc },
          }
        : current.sso,
    });
    tenant.settings = merged as unknown as Record<string, unknown>;
    await this.tenantRepo.save(tenant);
    return merged;
  }

  private mergeSettings(partial: Partial<TenantSettings>): TenantSettings {
    return {
      ...DEFAULT_SETTINGS,
      ...partial,
      sso: {
        ...DEFAULT_SETTINGS.sso,
        ...(partial.sso ?? {}),
        google: {
          ...DEFAULT_SETTINGS.sso.google,
          ...(partial.sso?.google ?? {}),
        },
        github: {
          ...DEFAULT_SETTINGS.sso.github,
          ...(partial.sso?.github ?? {}),
        },
        saml: {
          ...DEFAULT_SETTINGS.sso.saml,
          ...(partial.sso?.saml ?? {}),
        },
        oidc: {
          ...DEFAULT_SETTINGS.sso.oidc,
          ...(partial.sso?.oidc ?? {}),
        },
      },
    };
  }
}
