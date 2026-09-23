import type { DataSource } from 'typeorm';

export const AUTOMATIC_TIME_CORE_MIGRATION_ID = '001-automatic-time-core';

function quoteSchemaName(schemaName: string): string {
  if (!/^[a-z][a-z0-9_]*$/.test(schemaName)) {
    throw new Error(`Invalid tenant schema name: ${schemaName}`);
  }

  return `"${schemaName}"`;
}

export function automaticTimeCoreMigrationSql(schemaName: string): string {
  const schema = quoteSchemaName(schemaName);

  return `
    ALTER TABLE ${schema}."time_entries"
      ADD COLUMN IF NOT EXISTS "started_at" TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS "ended_at" TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS "source" VARCHAR(20) NOT NULL DEFAULT 'manual',
      ADD COLUMN IF NOT EXISTS "source_plugin_id" VARCHAR(255),
      ADD COLUMN IF NOT EXISTS "source_reference" VARCHAR(255),
      ADD COLUMN IF NOT EXISTS "locked_at" TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS "lock_reason" VARCHAR(500),
      ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW();

    CREATE UNIQUE INDEX IF NOT EXISTS "UQ_time_entries_plugin_source_reference"
      ON ${schema}."time_entries" ("source_plugin_id", "source_reference")
      WHERE "source_plugin_id" IS NOT NULL AND "source_reference" IS NOT NULL;
  `;
}

export async function runAutomaticTimeCoreMigration(
  dataSource: Pick<DataSource, 'query'>,
  schemaName: string,
): Promise<void> {
  await dataSource.query(automaticTimeCoreMigrationSql(schemaName));
}
