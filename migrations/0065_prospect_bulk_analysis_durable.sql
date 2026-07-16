-- Phase 2.5: durable bulk analysis leases + per-item results for resume/retry
ALTER TABLE prospect_bulk_analysis_jobs
  ADD COLUMN IF NOT EXISTS item_results jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE prospect_bulk_analysis_jobs
  ADD COLUMN IF NOT EXISTS filters_snapshot jsonb;

ALTER TABLE prospect_bulk_analysis_jobs
  ADD COLUMN IF NOT EXISTS lease_owner text;

ALTER TABLE prospect_bulk_analysis_jobs
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamp;

ALTER TABLE prospect_bulk_analysis_jobs
  ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now();

ALTER TABLE prospect_bulk_analysis_jobs
  ADD COLUMN IF NOT EXISTS parent_job_id varchar;

CREATE INDEX IF NOT EXISTS prospect_bulk_analysis_jobs_claim_idx
  ON prospect_bulk_analysis_jobs (status, lease_expires_at, created_at);
