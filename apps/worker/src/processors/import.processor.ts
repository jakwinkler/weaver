import { Job } from 'bullmq';
import { In } from 'typeorm';
import {
  createPostgresDataSource,
  ImportJobEntity,
  TENANT_ENTITIES,
  runJiraImportMigration,
} from '@weaver/db';
import { FieldMapper, ImportOrchestrator, JiraClient } from '@weaver/jira-import';
import type { JiraImportJobData, SealedJiraImportJobData } from '@weaver/shared';
import { config } from '../config';

import { assertTenantSchemaName, openImportJob } from '@weaver/server-common';

export async function processImport(job: Job<SealedJiraImportJobData>): Promise<void> {
  if (job.data.version !== 1)
    throw new Error('Unencrypted import jobs are not accepted; restart the import');
  const data = openImportJob<JiraImportJobData>(
    job.data.payload,
    `${job.data.tenantId}:${job.data.importJobId}`,
    process.env.IMPORT_CREDENTIAL_KEY,
  );
  if (data.tenantId !== job.data.tenantId || data.importJobId !== job.data.importJobId)
    throw new Error('Import job identity mismatch');
  assertTenantSchemaName(data.schemaName);

  const dataSource = createPostgresDataSource({
    type: 'postgres',
    host: config.database.host,
    port: config.database.port,
    username: config.database.username,
    password: config.database.password,
    database: config.database.database,
    schema: data.schemaName,
    entities: [...TENANT_ENTITIES],
    synchronize: false,
    logging: false,
  });

  await dataSource.initialize();
  let tenantVerified = false;
  try {
    const tenants = await dataSource.query(
      'SELECT id FROM public.tenants WHERE id = $1 AND schema_name = $2',
      [data.tenantId, data.schemaName],
    );
    if (!tenants.length) throw new Error('Tenant does not match job schema');
    tenantVerified = true;
    await runJiraImportMigration(dataSource, data.schemaName);
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    const lockKey = `${data.tenantId}:jira-import`;
    try {
      const [lock] = await runner.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked', [
        lockKey,
      ]);
      if (!lock.locked) throw new Error('Another import is running for this organization');
      const orchestrator = new ImportOrchestrator(
        runner.manager,
        new JiraClient(),
        new FieldMapper(),
        data,
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
      await runner.query('SELECT pg_advisory_unlock(hashtext($1))', [lockKey]);
      await runner.release();
    }
  } catch (error) {
    if (tenantVerified)
      await dataSource
        .getRepository(ImportJobEntity)
        .update(
          { id: data.importJobId, status: In(['queued', 'running']) },
          {
            status: 'failed',
            currentStep: 'Worker could not complete this import; review worker logs',
            completedAt: new Date(),
          },
        )
        .catch(() => undefined);
    throw error;
  } finally {
    await dataSource.destroy();
  }
}
