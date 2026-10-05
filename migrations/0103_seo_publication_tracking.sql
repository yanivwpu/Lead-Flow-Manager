ALTER TABLE seo_github_executions ADD COLUMN IF NOT EXISTS publication_requested_at timestamp;
ALTER TABLE seo_github_executions ADD COLUMN IF NOT EXISTS publication_requested_by text;
ALTER TABLE seo_github_executions ADD COLUMN IF NOT EXISTS merge_sha varchar(64);
ALTER TABLE seo_github_executions ADD COLUMN IF NOT EXISTS live_at timestamp;
ALTER TABLE seo_github_executions ADD COLUMN IF NOT EXISTS performance jsonb NOT NULL DEFAULT '{}';
ALTER TABLE seo_github_executions ADD COLUMN IF NOT EXISTS failure_code text;
CREATE INDEX IF NOT EXISTS seo_github_publication_idx ON seo_github_executions(status,publication_requested_at,lease_expires_at);
