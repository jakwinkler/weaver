import type { DataSource } from 'typeorm';

/** Additive. Source identities deliberately have no public.users or membership FK. */
export async function runJiraImportMigration(
  ds: Pick<DataSource, 'transaction'>,
  schemaName: string,
): Promise<void> {
  if (!/^tenant_[a-z0-9_]+$/.test(schemaName)) throw new Error('Invalid tenant schema name');
  const s = `"${schemaName}"`;
  await ds.transaction(async (manager) => {
    // IF NOT EXISTS alone cannot serialize concurrent PostgreSQL catalog writes.
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `${schemaName}:jira-import-migration`,
    ]);
    await manager.query(`
    CREATE TABLE IF NOT EXISTS ${s}.imported_people (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), source_instance TEXT NOT NULL,
      external_id VARCHAR(255) NOT NULL, display_name VARCHAR(255) NOT NULL,
      email VARCHAR(255), account_type VARCHAR(30) NOT NULL DEFAULT 'atlassian',
      source_active BOOLEAN NOT NULL DEFAULT true, linked_user_id UUID,
      project_ids UUID[] NOT NULL DEFAULT '{}', invite_token_hash VARCHAR(64),
      invite_email VARCHAR(255), invite_role VARCHAR(20) NOT NULL DEFAULT 'viewer',
      invite_project_ids UUID[] NOT NULL DEFAULT '{}', invite_expires_at TIMESTAMPTZ,
      invited_at TIMESTAMPTZ, accepted_at TIMESTAMPTZ, created_at TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT imported_people_source_instance_external_id_key UNIQUE(source_instance, external_id)
    );
    CREATE TABLE IF NOT EXISTS ${s}.imported_audiences (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), source_instance TEXT NOT NULL,
      kind VARCHAR(30) NOT NULL, identifier TEXT NOT NULL, name TEXT NOT NULL,
      user_ids UUID[] NOT NULL DEFAULT '{}',
      CONSTRAINT imported_audiences_source_instance_kind_identifier_key UNIQUE(source_instance, kind, identifier)
    );
    CREATE TABLE IF NOT EXISTS ${s}.imported_resources (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), source_instance TEXT NOT NULL,
      kind VARCHAR(30) NOT NULL, external_id VARCHAR(255) NOT NULL, import_job_id UUID NOT NULL,
      project_id UUID NOT NULL, issue_id UUID, payload JSONB NOT NULL,
      native_snapshot JSONB, visibility JSONB, updated_at TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT imported_resources_source_instance_kind_external_id_key UNIQUE(source_instance, kind, external_id)
    );
    CREATE INDEX IF NOT EXISTS "IDX_imported_resources_job" ON ${s}.imported_resources(import_job_id);
    ALTER TABLE ${s}.projects ADD COLUMN IF NOT EXISTS import_quarantined BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE ${s}.comments ADD COLUMN IF NOT EXISTS visibility JSONB,
      ADD COLUMN IF NOT EXISTS source_id VARCHAR,
      ADD COLUMN IF NOT EXISTS parent_comment_id UUID;
    ALTER TABLE ${s}.attachments ADD COLUMN IF NOT EXISTS visibility JSONB,
      ADD COLUMN IF NOT EXISTS source_id VARCHAR;
    ALTER TABLE IF EXISTS ${s}.import_jobs ADD COLUMN IF NOT EXISTS report JSONB NOT NULL DEFAULT '{}';
  `);
    // Schemas provisioned before the entities named these objects have TypeORM's generated names,
    // plus a second import_job_id index. Converge them on the names the entities declare.
    await manager.query(`DO $migration$
    DECLARE r record;
    BEGIN
      FOR r IN SELECT * FROM (VALUES
        ('imported_people', 'UQ_aa90f4ee6b1078f529de6d9a5da', 'imported_people_source_instance_external_id_key'),
        ('imported_audiences', 'UQ_f2dd1a962be524fe1477da46ebc', 'imported_audiences_source_instance_kind_identifier_key'),
        ('imported_resources', 'UQ_af2dcc8f25c2ff1f7406f7d493a', 'imported_resources_source_instance_kind_external_id_key')
      ) AS v(table_name, old_name, new_name) LOOP
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = r.old_name
          AND conrelid = to_regclass(format('%I.%I', '${schemaName}', r.table_name))) THEN
          EXECUTE format('ALTER TABLE %I.%I RENAME CONSTRAINT %I TO %I',
            '${schemaName}', r.table_name, r.old_name, r.new_name);
        END IF;
      END LOOP;
    END $migration$;
    DROP INDEX IF EXISTS ${s}."IDX_c3cf5230aac8011395aeb6f4f2";`);
    // Old imports have no audience metadata. Quarantine them until a reimport repairs it.
    await manager.query(`DO $migration$
    BEGIN
      IF to_regclass('${schemaName}.import_records') IS NOT NULL THEN
        UPDATE ${s}.attachments a SET source_id = r.external_id,
          visibility = jsonb_build_object('sourceInstance', r.source_instance, 'type', 'unknown',
            'identifier', 'attachment-review', 'value', 'Imported Jira file requires access review')
        FROM ${s}.import_records r WHERE r.external_type = 'attachment' AND r.local_id = a.id AND a.source_id IS NULL;
        UPDATE ${s}.comments c SET source_id = r.external_id,
          visibility = jsonb_build_object('sourceInstance', r.source_instance, 'type', 'unknown',
            'identifier', 'legacy-import', 'value', 'Legacy import requires a fresh visibility check')
        FROM ${s}.import_records r WHERE r.external_type = 'comment' AND r.local_id = c.id AND c.source_id IS NULL;
      END IF;
    END $migration$;`);
  });
}
