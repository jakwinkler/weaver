-- Apply to the public schema before deploying invitation endpoints where synchronize is disabled.
-- Then apply 20261015_organization_invitations_alignment.sql, which gives this table TypeORM's names.
CREATE TABLE IF NOT EXISTS public.organization_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email varchar(255) NOT NULL,
  role varchar(20) NOT NULL,
  token_hash varchar(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organization_invitations_tenant_id
  ON public.organization_invitations (tenant_id);
