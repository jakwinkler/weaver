import { Job } from 'bullmq';
import { DataSource } from 'typeorm';
import { TENANT_ENTITIES } from '@weaver/db';
import { FieldMapper, ImportOrchestrator, JiraClient } from '@weaver/jira-import';
import type { JiraImportJobData } from '@weaver/shared';
import { config } from '../config';

const TENANT_SCHEMA = /^[a-z_][a-z0-9_]*$/;

export async function processImport(job: Job<JiraImportJobData>): Promise<void> {
  if (!TENANT_SCHEMA.test(job.data.schemaName)) {
    throw new Error('Invalid tenant schema in Jira import job');
  }

  const dataSource = new DataSource({
    type: 'postgres',
    host: config.database.host,
    port: config.database.port,
    username: config.database.user,
    password: config.database.password,
    database: config.database.name,
    schema: job.data.schemaName,
    entities: [...TENANT_ENTITIES],
    synchronize: false,
    logging: false,
  });

  await dataSource.initialize();
  try {
    const orchestrator = new ImportOrchestrator(
      dataSource.manager,
      new JiraClient(),
      new FieldMapper(),
      job.data,
      async (progress) => {
        const processed = progress.importedItems + progress.skippedItems + progress.errors.length;
        const percent =
          progress.totalItems > 0
            ? Math.min(99, Math.round((processed / progress.totalItems) * 100))
            : 0;
        await job.updateProgress(percent);
      },
    );
    await orchestrator.run();
    await job.updateProgress(100);
  } finally {
    await dataSource.destroy();
  }
}
