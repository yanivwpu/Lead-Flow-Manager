CREATE TABLE IF NOT EXISTS seo_scheduled_analysis_claims (
  property_id text NOT NULL,
  reporting_day date NOT NULL,
  sync_run_id varchar NOT NULL REFERENCES seo_sync_runs(id),
  status text NOT NULL DEFAULT 'running',
  lease_token text NOT NULL,
  lease_expires_at timestamp NOT NULL,
  analysis_run_id varchar REFERENCES seo_analysis_runs(id),
  last_error text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS seo_scheduled_analysis_claims_property_day_uidx
  ON seo_scheduled_analysis_claims(property_id, reporting_day);
CREATE INDEX IF NOT EXISTS seo_scheduled_analysis_claims_lease_idx
  ON seo_scheduled_analysis_claims(status, lease_expires_at);

CREATE TABLE IF NOT EXISTS seo_github_executions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id varchar NOT NULL REFERENCES seo_actions(id),
  action_version integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  lease_token text,
  lease_expires_at timestamp,
  branch_name text,
  commit_sha varchar(64),
  pr_number integer,
  pr_url text,
  error_message text,
  started_at timestamp,
  completed_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  UNIQUE(action_id, action_version)
);
CREATE INDEX IF NOT EXISTS seo_github_executions_status_lease_idx
  ON seo_github_executions(status, lease_expires_at, created_at);
