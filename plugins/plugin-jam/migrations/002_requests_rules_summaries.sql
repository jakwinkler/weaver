-- Phase 3: recording requests. The signed reference in a request's link names this row; the
-- row, not the issue key in the link, decides which issue a recorded Jam attaches to.
CREATE TABLE IF NOT EXISTS jam_recording_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL,
  mode VARCHAR(20) NOT NULL,
  recording_link_public_id VARCHAR(64),
  title VARCHAR(255),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  jams_received INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT jam_recording_requests_mode_check CHECK (mode IN ('url_parameter', 'dedicated_link'))
);
CREATE INDEX IF NOT EXISTS idx_jam_recording_requests_issue ON jam_recording_requests (issue_id, created_at DESC);

-- Phase 4: routing rules. The first enabled rule whose matchers all match decides.
CREATE TABLE IF NOT EXISTS jam_routing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  match JSONB NOT NULL,
  action VARCHAR(10) NOT NULL,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  issue_type_id UUID,
  priority VARCHAR(20),
  labels TEXT[] NOT NULL DEFAULT '{}',
  assignee_id UUID,
  hourly_limit INT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT jam_routing_rules_action_check CHECK (action IN ('create', 'inbox'))
);

-- Phase 4: cached debug summaries (counts, trimmed console errors, failed request lines).
CREATE TABLE IF NOT EXISTS jam_summaries (
  jam_id UUID PRIMARY KEY REFERENCES jam_items(jam_id) ON DELETE CASCADE,
  summary JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE jam_issue_links
  ADD COLUMN IF NOT EXISTS request_id UUID REFERENCES jam_recording_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rule_id UUID REFERENCES jam_routing_rules(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_jam_issue_links_rule_recent
  ON jam_issue_links (rule_id, created_at) WHERE rule_id IS NOT NULL;

-- Phase 4: an inbox rule, or a rule over its hourly limit, suggests a project for the Jam.
ALTER TABLE jam_items
  ADD COLUMN IF NOT EXISTS suggested_project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
