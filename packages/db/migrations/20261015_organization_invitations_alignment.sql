-- Apply to the public schema after 20261014_organization_invitations.sql where synchronize is disabled.
-- Brings public.organization_invitations to the TypeORM entity without dropping data, from either
-- earlier shape: the 20261014 file's PostgreSQL default names, or a reviewed schema plan's
-- created_at timestamp without time zone. Safe to run more than once. Afterwards a schema plan
-- shows no change for this table.
-- created_at values stored without a time zone are read in this session's TimeZone. Run it with
-- the same TimeZone as the API's database sessions (the server default; UTC in deploy/compose).
-- Rollback: none needed; every change is a rename, an equivalent index, or a lossless type change.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  invitations regclass := to_regclass('public.organization_invitations');
  converted bigint;
BEGIN
  IF invitations IS NULL THEN
    RAISE EXCEPTION 'public.organization_invitations does not exist; apply 20261014_organization_invitations.sql first';
  END IF;
  LOCK TABLE public.organization_invitations IN ACCESS EXCLUSIVE MODE;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = invitations AND conname = 'organization_invitations_pkey') THEN
    ALTER TABLE public.organization_invitations
      RENAME CONSTRAINT organization_invitations_pkey TO "PK_f172f12b8a9ee6584b661f57e24";
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = invitations AND conname = 'organization_invitations_tenant_id_fkey') THEN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = invitations AND conname = 'FK_6408170bde61108d09132e379fa') THEN
      ALTER TABLE public.organization_invitations DROP CONSTRAINT organization_invitations_tenant_id_fkey;
    ELSE
      ALTER TABLE public.organization_invitations
        RENAME CONSTRAINT organization_invitations_tenant_id_fkey TO "FK_6408170bde61108d09132e379fa";
    END IF;
  END IF;

  -- Applying 20261014 after a schema plan created the table leaves a second tenant_id index.
  IF to_regclass('public.idx_organization_invitations_tenant_id') IS NOT NULL THEN
    IF to_regclass('public."IDX_6408170bde61108d09132e379f"') IS NOT NULL THEN
      DROP INDEX public.idx_organization_invitations_tenant_id;
    ELSE
      ALTER INDEX public.idx_organization_invitations_tenant_id RENAME TO "IDX_6408170bde61108d09132e379f";
    END IF;
  END IF;

  -- TypeORM models token_hash uniqueness as a unique index, not a constraint.
  -- Build the index before dropping the constraint so uniqueness is never relaxed.
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = invitations AND conname = 'organization_invitations_token_hash_key') THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "IDX_da2dfab0d3cb7f1bfdc886c428"
      ON public.organization_invitations (token_hash);
    ALTER TABLE public.organization_invitations DROP CONSTRAINT organization_invitations_token_hash_key;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'organization_invitations'
      AND column_name = 'created_at' AND data_type = 'timestamp without time zone'
  ) THEN
    SELECT count(*) INTO converted FROM public.organization_invitations;
    ALTER TABLE public.organization_invitations
      ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE current_setting('TimeZone');
    RAISE NOTICE 'organization_invitations.created_at: converted % rows to timestamptz using TimeZone %',
      converted, current_setting('TimeZone');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = invitations AND conname = 'FK_6408170bde61108d09132e379fa')
    OR to_regclass('public."IDX_6408170bde61108d09132e379f"') IS NULL
    OR to_regclass('public."IDX_da2dfab0d3cb7f1bfdc886c428"') IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'organization_invitations'
        AND column_name = 'created_at' AND data_type = 'timestamp with time zone'
    ) THEN
    RAISE EXCEPTION 'public.organization_invitations has an unexpected shape; nothing was changed. Compare it with the entity before retrying';
  END IF;
END
$$;

COMMIT;
