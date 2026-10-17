-- Jam snapshots, one row per Jam Weaver has received. Media, console logs, and network data stay
-- in Jam; thumbnail_url is the only media reference kept, and it is shown only to issue readers.
CREATE TABLE IF NOT EXISTS jam_items (
  jam_id UUID PRIMARY KEY,
  team_id UUID NOT NULL,
  jam_url TEXT NOT NULL,
  jam_type VARCHAR(20) NOT NULL,
  title VARCHAR(500),
  description TEXT,
  original_url TEXT,
  origin VARCHAR(40),
  author_email VARCHAR(320),
  author_name VARCHAR(255),
  thumbnail_url TEXT,
  system_info JSONB NOT NULL DEFAULT '{}',
  recording_link_public_id VARCHAR(64),
  recording_link_name VARCHAR(255),
  recording_reference TEXT,
  submitter_comment TEXT,
  jam_created_at TIMESTAMPTZ NOT NULL,
  received_via VARCHAR(20) NOT NULL,
  state VARCHAR(20) NOT NULL DEFAULT 'new',
  flag VARCHAR(40),
  triaged_by UUID,
  triaged_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT jam_items_state_check CHECK (state IN ('new', 'creating', 'linked', 'dismissed'))
);
CREATE INDEX IF NOT EXISTS idx_jam_items_inbox ON jam_items (state, jam_created_at DESC);

-- Links key on issue_id, not the issue key, because moving an issue changes its key.
CREATE TABLE IF NOT EXISTS jam_issue_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jam_id UUID NOT NULL REFERENCES jam_items(jam_id) ON DELETE CASCADE,
  issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  link_source VARCHAR(30) NOT NULL,
  linked_by UUID,
  backlink_state VARCHAR(20) NOT NULL DEFAULT 'pending',
  backlink_attempts INT NOT NULL DEFAULT 0,
  backlink_next_attempt_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (jam_id, issue_id),
  CONSTRAINT jam_issue_links_backlink_check CHECK (backlink_state IN ('pending', 'posted', 'failed', 'disabled'))
);
CREATE INDEX IF NOT EXISTS idx_jam_issue_links_issue ON jam_issue_links (issue_id);
CREATE INDEX IF NOT EXISTS idx_jam_issue_links_backlink_due
  ON jam_issue_links (backlink_next_attempt_at) WHERE backlink_state = 'pending';

CREATE TABLE IF NOT EXISTS jam_plugin_state (
  key VARCHAR(64) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
