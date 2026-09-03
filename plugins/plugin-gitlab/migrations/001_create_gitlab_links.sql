CREATE TABLE IF NOT EXISTS gitlab_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_key VARCHAR(32) NOT NULL,
  link_type VARCHAR(32) NOT NULL,
  url TEXT NOT NULL,
  title VARCHAR(255) NOT NULL,
  author VARCHAR(255) NOT NULL,
  status VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (issue_key, url)
);

CREATE INDEX IF NOT EXISTS idx_gitlab_links_issue_key
  ON gitlab_links (issue_key);
