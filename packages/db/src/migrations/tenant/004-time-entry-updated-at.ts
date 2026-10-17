import type { DataSource } from 'typeorm';

/**
 * Migration 001 added time_entries.updated_at as TIMESTAMPTZ to tenants provisioned before the
 * entity declared it, where the entity maps TIMESTAMP holding UTC. Converts only that column type
 * and keeps every value. A no-op where the column is already TIMESTAMP.
 */
export async function runTimeEntryUpdatedAtMigration(
  ds: Pick<DataSource, 'transaction'>,
  schemaName: string,
): Promise<void> {
  if (!/^tenant_[a-z0-9_]+$/.test(schemaName)) throw new Error('Invalid tenant schema name');
  await ds.transaction(async (manager) => {
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `${schemaName}:time-entry-updated-at`,
    ]);
    await manager.query(`DO $migration$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = '${schemaName}' AND table_name = 'time_entries'
          AND column_name = 'updated_at' AND data_type = 'timestamp with time zone'
      ) THEN
        ALTER TABLE "${schemaName}".time_entries
          ALTER COLUMN updated_at TYPE TIMESTAMP USING updated_at AT TIME ZONE 'UTC';
      END IF;
    END $migration$`);
  });
}
