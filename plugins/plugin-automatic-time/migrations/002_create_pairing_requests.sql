CREATE TABLE IF NOT EXISTS automatic_time_pairing_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash VARCHAR(64) NOT NULL UNIQUE,
  user_code VARCHAR(9) NOT NULL UNIQUE,
  user_id UUID,
  device_id UUID REFERENCES automatic_time_devices(id) ON DELETE SET NULL,
  display_name VARCHAR(200) NOT NULL,
  platform VARCHAR(30) NOT NULL CHECK (platform = 'macos'),
  companion_version VARCHAR(50) NOT NULL,
  requested_scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'exchanged', 'denied', 'expired')),
  exchange_attempts INTEGER NOT NULL DEFAULT 0 CHECK (exchange_attempts >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  approved_at TIMESTAMPTZ,
  exchanged_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_automatic_time_pairing_expiration
  ON automatic_time_pairing_requests(status, expires_at);
