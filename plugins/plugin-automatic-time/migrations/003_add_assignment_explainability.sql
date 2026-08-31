ALTER TABLE automatic_time_drafts
  ADD COLUMN IF NOT EXISTS assignment_alternatives JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ruleset_version VARCHAR(100) NOT NULL DEFAULT 'legacy-v1';
