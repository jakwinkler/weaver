-- Apply to the public schema before deploying the API that ends sessions on password reset,
-- where synchronize is disabled. Matches TypeORM's column, so a schema plan reviewed
-- afterwards shows no change here. Adding a column with a constant default does not rewrite
-- the table, and every existing token counts as version 0, so nobody is signed out by it.
-- Rollback: deploy the previous API first, then
--   ALTER TABLE public.users DROP COLUMN IF EXISTS session_version;
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 0;
