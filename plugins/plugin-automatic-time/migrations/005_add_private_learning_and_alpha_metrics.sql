ALTER TABLE automatic_time_drafts
  ADD COLUMN IF NOT EXISTS correction_context_digest VARCHAR(80),
  ADD COLUMN IF NOT EXISTS suggested_issue_key VARCHAR(100);

ALTER TABLE automatic_time_release_batches
  ADD COLUMN IF NOT EXISTS review_duration_seconds INTEGER
    CHECK (review_duration_seconds IS NULL OR review_duration_seconds >= 0);

ALTER TABLE automatic_time_user_settings
  ADD COLUMN IF NOT EXISTS correction_revision BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recompute_context_digests JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS uq_automatic_time_memory_issue_target
  ON automatic_time_correction_memories (
    user_id,
    memory_type,
    normalized_features,
    target_issue_key
  )
  WHERE target_issue_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS automatic_time_review_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  draft_id UUID NOT NULL,
  local_date DATE NOT NULL,
  action VARCHAR(30) NOT NULL
    CHECK (action IN ('assigned', 'reassigned', 'rejected', 'deleted')),
  from_issue_key VARCHAR(100),
  to_issue_key VARCHAR(100),
  proposed_minutes INTEGER NOT NULL CHECK (proposed_minutes > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automatic_time_review_events_user_day
  ON automatic_time_review_events(user_id, local_date, action);

CREATE TABLE IF NOT EXISTS automatic_time_review_sessions (
  user_id UUID NOT NULL,
  local_date DATE NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  duration_seconds INTEGER CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  PRIMARY KEY (user_id, local_date)
);
