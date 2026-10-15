-- Apply to the public schema before deploying password reset endpoints where synchronize is disabled.
-- Index and constraint names match TypeORM's, so a schema plan reviewed afterwards shows no change here.
-- Rollback: DROP TABLE IF EXISTS public.password_reset_tokens;
CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  selector varchar(32) NOT NULL,
  verifier_hash varchar(64) NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "FK_52ac39dd8a28730c63aeb428c9c"
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IDX_52ac39dd8a28730c63aeb428c9"
  ON public.password_reset_tokens (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS "IDX_b5a3a4947218beb745f8a63796"
  ON public.password_reset_tokens (selector);

CREATE INDEX IF NOT EXISTS "IDX_7c038e5a589b06cbe4320cc88b"
  ON public.password_reset_tokens (expires_at);
