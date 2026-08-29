import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ImportJobEntity } from '@weaver/db';
import type { JiraProjectSummary } from '@weaver/shared';
import type { EntityManager } from 'typeorm';
import { requireTenantContext, TenantConnectionProvider } from '../../core/tenant';
import { filterSelectedProjects } from './import-orchestrator.service';
import { JiraClientService } from './jira-client.service';
import { ImportQueueService } from './import-queue.service';
import type { StartJiraImportDto } from './import.schemas';

@Injectable()
export class ImportService {
  constructor(
    private readonly tenantConnections: TenantConnectionProvider,
    private readonly jiraClient: JiraClientService,
    private readonly queue: ImportQueueService,
  ) {}

  async discoverProjects(config: StartJiraImportDto['config']): Promise<JiraProjectSummary[]> {
    try {
      await this.jiraClient.testConnection(config);
      const projects = await this.jiraClient.getProjects(config);
      return projects.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      throw new BadRequestException(
        `Could not connect to Jira: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async start(dto: StartJiraImportDto, requestedByUserId: string): Promise<ImportJobEntity> {
    const projects = await this.discoverProjects(dto.config);
    try {
      filterSelectedProjects(projects, dto.projectKeys);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : String(error));
    }

    const context = requireTenantContext();
    const manager = await this.tenantConnections.getEntityManager();
    await this.ensureStorage(manager, context.schemaName);
    const repo = manager.getRepository(ImportJobEntity);
    const job = await repo.save(
      repo.create({
        source: dto.config.source,
        sourceUrl: normalizeSourceUrl(dto.config.baseUrl),
        status: 'queued',
        progress: 0,
        currentStep: 'Queued',
        totalItems: 0,
        importedItems: 0,
        skippedItems: 0,
        errors: [],
        selectedProjectKeys: dto.projectKeys ?? null,
        startedAt: null,
        completedAt: null,
      }),
    );

    try {
      await this.queue.enqueue({
        importJobId: job.id,
        tenantId: context.tenantId,
        schemaName: context.schemaName,
        requestedByUserId,
        config: dto.config,
        projectKeys: dto.projectKeys,
      });
    } catch (error) {
      job.status = 'failed';
      job.currentStep = 'Unable to queue import';
      job.completedAt = new Date();
      job.errors = [
        {
          itemType: 'queue',
          message: error instanceof Error ? error.message : String(error),
        },
      ];
      await repo.save(job);
      throw new ServiceUnavailableException('Unable to queue the Jira import');
    }

    return job;
  }

  async getStatus(id: string): Promise<ImportJobEntity> {
    const context = requireTenantContext();
    const manager = await this.tenantConnections.getEntityManager();
    await this.ensureStorage(manager, context.schemaName);
    const job = await manager.getRepository(ImportJobEntity).findOneBy({ id });
    if (!job) throw new NotFoundException(`Import job "${id}" not found`);
    return job;
  }

  async cancel(id: string): Promise<ImportJobEntity> {
    const job = await this.getStatus(id);
    if (job.status === 'completed' || job.status === 'failed') {
      throw new BadRequestException(`Cannot cancel an import that is ${job.status}`);
    }
    if (job.status !== 'cancelled') {
      const manager = await this.tenantConnections.getEntityManager();
      job.status = 'cancelled';
      job.currentStep = 'Cancelling import';
      job.completedAt = new Date();
      await manager.getRepository(ImportJobEntity).save(job);
      await this.queue.cancel(id);
    }
    return job;
  }

  private async ensureStorage(manager: EntityManager, schemaName: string): Promise<void> {
    if (!/^[a-z_][a-z0-9_]*$/.test(schemaName)) {
      throw new Error('Invalid tenant schema name');
    }
    await manager.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."import_jobs" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        source VARCHAR(30) NOT NULL,
        source_url TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'queued',
        progress INTEGER NOT NULL DEFAULT 0,
        current_step VARCHAR(100) NOT NULL DEFAULT 'Queued',
        total_items INTEGER NOT NULL DEFAULT 0,
        imported_items INTEGER NOT NULL DEFAULT 0,
        skipped_items INTEGER NOT NULL DEFAULT 0,
        errors JSONB NOT NULL DEFAULT '[]'::jsonb,
        selected_project_keys JSONB,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await manager.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."import_records" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        import_job_id UUID NOT NULL,
        source_instance TEXT NOT NULL,
        external_type VARCHAR(30) NOT NULL,
        external_id VARCHAR(255) NOT NULL,
        local_id UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "UQ_import_record_source"
          UNIQUE (source_instance, external_type, external_id)
      )
    `);
    await manager.query(
      `CREATE INDEX IF NOT EXISTS "IDX_import_records_local_id" ON "${schemaName}"."import_records" (local_id)`,
    );
  }
}

function normalizeSourceUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}
