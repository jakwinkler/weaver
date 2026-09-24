CREATE TABLE IF NOT EXISTS repository_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name varchar(255) NOT NULL,
  url varchar(2048) NOT NULL,
  provider varchar(32) NOT NULL DEFAULT 'github',
  default_branch varchar(255) NOT NULL DEFAULT 'main',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS repository_links_project_idx ON repository_links(project_id);
CREATE TABLE IF NOT EXISTS issue_repository_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  repository_link_id uuid REFERENCES repository_links(id) ON DELETE CASCADE,
  branch_name varchar(255),
  pr_url varchar(2048),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS issue_repository_links_issue_idx ON issue_repository_links(issue_id);
