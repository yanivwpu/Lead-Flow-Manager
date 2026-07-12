-- Phase 2.5: background prospect import preview scans + preview job linkage on import jobs
CREATE TABLE IF NOT EXISTS prospect_import_preview_jobs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  integration_id varchar NOT NULL,
  location_id text NOT NULL,
  destination_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  initiated_by_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  filter_fingerprint text NOT NULL,
  scan_scope text NOT NULL DEFAULT '1000',
  import_limit integer NOT NULL DEFAULT 100,
  applied_template_hint text,
  status text NOT NULL DEFAULT 'pending',
  progress_scanned integer DEFAULT 0,
  progress_target integer DEFAULT 0,
  progress_matches integer DEFAULT 0,
  ghl_reported_total integer,
  last_page integer DEFAULT 1,
  scan_stopped_early boolean DEFAULT false,
  scan_complete boolean DEFAULT false,
  skipped_by_filters integer DEFAULT 0,
  matched_snapshots jsonb DEFAULT '[]'::jsonb,
  all_matched_external_ids jsonb DEFAULT '[]'::jsonb,
  skipped_diagnostics jsonb DEFAULT '[]'::jsonb,
  preview_result jsonb,
  error_message text,
  scanned_at timestamp,
  created_at timestamp DEFAULT now(),
  started_at timestamp,
  completed_at timestamp
);

CREATE INDEX IF NOT EXISTS prospect_import_preview_jobs_fingerprint_idx
  ON prospect_import_preview_jobs (filter_fingerprint, status);

CREATE INDEX IF NOT EXISTS prospect_import_preview_jobs_integration_idx
  ON prospect_import_preview_jobs (integration_id, location_id, created_at DESC);

ALTER TABLE prospect_import_jobs ADD COLUMN IF NOT EXISTS preview_job_id varchar;
