-- Prospect Intelligence & Enrichment (Phase 2)
-- Additive only. Manual Neon apply required (not auto-run on Railway).
-- Enrichment runs only after human approval / campaign queue — never on discover.

ALTER TABLE prospect_intelligence
  ADD COLUMN IF NOT EXISTS enrichment_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS enrichment_provider text,
  ADD COLUMN IF NOT EXISTS enrichment_triggered_by text,
  ADD COLUMN IF NOT EXISTS website_analyzed_at timestamp,
  ADD COLUMN IF NOT EXISTS website_url_used text,
  ADD COLUMN IF NOT EXISTS enrichment_email_found boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enrichment_phone_found boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enrichment_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS enrichment_error_message text,
  ADD COLUMN IF NOT EXISTS enrichment_job_id varchar;

CREATE INDEX IF NOT EXISTS prospect_intelligence_enrichment_status_idx
  ON prospect_intelligence (enrichment_status);

CREATE TABLE IF NOT EXISTS prospect_enrichment_jobs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id varchar NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  initiated_by_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  provider text NOT NULL DEFAULT 'website_public',
  trigger_source text NOT NULL DEFAULT 'approve',
  progress_current integer NOT NULL DEFAULT 0,
  progress_total integer NOT NULL DEFAULT 4,
  lease_owner text,
  lease_expires_at timestamp,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamp DEFAULT now(),
  started_at timestamp,
  completed_at timestamp,
  cancelled_at timestamp,
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prospect_enrichment_jobs_claim_idx
  ON prospect_enrichment_jobs (status, lease_expires_at, created_at);

CREATE INDEX IF NOT EXISTS prospect_enrichment_jobs_workspace_contact_idx
  ON prospect_enrichment_jobs (workspace_user_id, contact_id, created_at DESC);

CREATE INDEX IF NOT EXISTS prospect_enrichment_jobs_contact_status_idx
  ON prospect_enrichment_jobs (contact_id, status);
