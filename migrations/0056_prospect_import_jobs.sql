-- Internal prospect import jobs (admin Growth Tools)
CREATE TABLE IF NOT EXISTS prospect_import_jobs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  destination_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  initiated_by_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'gohighlevel',
  source_location_id text,
  source_integration_id varchar,
  status text NOT NULL DEFAULT 'pending',
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  import_options jsonb NOT NULL DEFAULT '{}'::jsonb,
  selected_external_ids jsonb,
  preview_total integer DEFAULT 0,
  progress_current integer DEFAULT 0,
  progress_total integer DEFAULT 0,
  result_imported integer DEFAULT 0,
  result_skipped integer DEFAULT 0,
  result_duplicates integer DEFAULT 0,
  result_errors integer DEFAULT 0,
  result_details jsonb DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamp DEFAULT now(),
  started_at timestamp,
  completed_at timestamp
);

CREATE INDEX IF NOT EXISTS prospect_import_jobs_destination_idx
  ON prospect_import_jobs (destination_user_id, created_at DESC);
