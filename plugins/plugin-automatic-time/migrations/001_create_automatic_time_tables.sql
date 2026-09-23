CREATE TABLE IF NOT EXISTS automatic_time_release_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  local_date DATE NOT NULL,
  idempotency_key VARCHAR(200) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'released', 'reopened', 'partially_locked')),
  reported_total_minutes INTEGER NOT NULL DEFAULT 0 CHECK (reported_total_minutes >= 0),
  official_time_entry_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at TIMESTAMPTZ,
  reopened_at TIMESTAMPTZ,
  UNIQUE (user_id, local_date),
  UNIQUE (user_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS automatic_time_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  source_reference VARCHAR(200) NOT NULL,
  local_date DATE NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  proposed_minutes INTEGER NOT NULL CHECK (proposed_minutes > 0),
  description VARCHAR(500) NOT NULL DEFAULT '',
  issue_id UUID REFERENCES issues(id) ON DELETE SET NULL,
  issue_key VARCHAR(100),
  confidence NUMERIC(5, 4) NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  assignment_method VARCHAR(100) NOT NULL DEFAULT 'unassigned',
  assignment_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'hidden', 'released', 'superseded')),
  evidence_digest VARCHAR(200) NOT NULL,
  release_batch_id UUID REFERENCES automatic_time_release_batches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at TIMESTAMPTZ,
  UNIQUE (user_id, source_reference),
  CHECK (ended_at > started_at)
);

CREATE INDEX IF NOT EXISTS idx_automatic_time_drafts_user_day
  ON automatic_time_drafts(user_id, local_date, status);

CREATE TABLE IF NOT EXISTS automatic_time_correction_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  memory_type VARCHAR(100) NOT NULL,
  normalized_features JSONB NOT NULL DEFAULT '{}'::jsonb,
  target_project_key VARCHAR(100),
  target_issue_key VARCHAR(100),
  weight NUMERIC(8, 4) NOT NULL DEFAULT 1,
  positive_count INTEGER NOT NULL DEFAULT 0,
  negative_count INTEGER NOT NULL DEFAULT 0,
  last_applied_at TIMESTAMPTZ,
  enabled BOOLEAN NOT NULL DEFAULT true,
  explanation VARCHAR(500) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automatic_time_memories_user
  ON automatic_time_correction_memories(user_id, enabled);

CREATE TABLE IF NOT EXISTS automatic_time_user_settings (
  user_id UUID PRIMARY KEY,
  capture_exclusions JSONB NOT NULL DEFAULT '{}'::jsonb,
  retention_days INTEGER NOT NULL DEFAULT 7 CHECK (retention_days BETWEEN 1 AND 7),
  confidence_threshold NUMERIC(5, 4) NOT NULL DEFAULT 0.75,
  interruption_smoothing_minutes INTEGER NOT NULL DEFAULT 3,
  rounding_minutes INTEGER NOT NULL DEFAULT 1,
  companion_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  inference_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS automatic_time_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  display_name VARCHAR(200) NOT NULL,
  platform VARCHAR(30) NOT NULL,
  companion_version VARCHAR(50) NOT NULL,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_automatic_time_devices_user
  ON automatic_time_devices(user_id, revoked_at);
