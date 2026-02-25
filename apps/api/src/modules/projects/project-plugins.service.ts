import { Injectable } from '@nestjs/common';
import { ProjectPluginEntity } from '@weaver/db';
import { TenantConnectionProvider } from '../../core/tenant';

export const DEFAULT_PROJECT_PLUGINS = [
  '@weaver/plugin-board',
  '@weaver/plugin-sprints',
  '@weaver/plugin-gantt',
  '@weaver/plugin-calendar',
  '@weaver/plugin-time-tracking',
];

@Injectable()
export class ProjectPluginsService {
  constructor(
    private readonly tenantConnections: TenantConnectionProvider,
  ) {}

  async findByProject(projectId: string): Promise<ProjectPluginEntity[]> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(ProjectPluginEntity);
    const rows = await repo.find({ where: { projectId } });

    // Auto-backfill: if no rows exist for this project, seed defaults
    if (rows.length === 0) {
      await this.seedDefaults(projectId);
      return repo.find({ where: { projectId } });
    }

    return rows;
  }

  async enable(projectId: string, pluginId: string): Promise<ProjectPluginEntity> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(ProjectPluginEntity);

    const existing = await repo.findOneBy({ projectId, pluginId });
    if (existing) {
      existing.enabled = true;
      return repo.save(existing);
    }

    const entry = repo.create({ projectId, pluginId, enabled: true });
    return repo.save(entry);
  }

  async disable(projectId: string, pluginId: string): Promise<void> {
    const em = await this.tenantConnections.getEntityManager();
    const repo = em.getRepository(ProjectPluginEntity);
    await repo.delete({ projectId, pluginId });
  }

  async seedDefaults(projectId: string): Promise<void> {
    for (const pluginId of DEFAULT_PROJECT_PLUGINS) {
      await this.enable(projectId, pluginId);
    }
  }
}
