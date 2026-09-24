import type { DataSource } from 'typeorm';

/** Additive and safe to rerun. Existing rows and attachment storage are untouched. */
export async function runReviewReliabilityMigration(
  dataSource: DataSource,
  schemaName: string,
): Promise<void> {
  if (!/^tenant_[a-z0-9_]+$/.test(schemaName)) throw new Error('Invalid tenant schema name');
  await dataSource.transaction(async (manager) => {
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `${schemaName}:review-reliability`,
    ]);
    await manager.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}".attachment_cleanup (
        storage_key VARCHAR(500) PRIMARY KEY,
        attachment_id UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS "${schemaName}".inbound_webhook_receipts (
        plugin_id VARCHAR(255) NOT NULL,
        digest VARCHAR(64) NOT NULL,
        processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (plugin_id, digest)
      );
      CREATE INDEX IF NOT EXISTS "IDX_inbound_webhook_receipts_processed_at"
        ON "${schemaName}".inbound_webhook_receipts (processed_at);
    `);
  });
}
