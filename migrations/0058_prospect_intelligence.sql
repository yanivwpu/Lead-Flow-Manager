-- Phase 2: Prospect AI Intelligence (internal growth tool)
CREATE TABLE IF NOT EXISTS prospect_intelligence (
  contact_id varchar PRIMARY KEY REFERENCES contacts(id) ON DELETE CASCADE,
  import_job_id varchar REFERENCES prospect_import_jobs(id) ON DELETE SET NULL,
  analysis_status text NOT NULL DEFAULT 'pending',
  review_status text NOT NULL DEFAULT 'pending',
  industry text,
  business_type text,
  company_name text,
  job_title text,
  agency_likelihood integer,
  shopify_merchant_likelihood integer,
  real_estate_likelihood integer,
  local_business_likelihood integer,
  saas_likelihood integer,
  potential_fit text,
  lead_score integer,
  priority text,
  recommended_offer text,
  suggested_outreach_angle text,
  suggested_first_message text,
  reasoning_summary text,
  needs_review boolean NOT NULL DEFAULT false,
  confidence integer,
  ai_model text,
  ai_version text,
  prompt_tokens integer,
  completion_tokens integer,
  raw_result jsonb DEFAULT '{}'::jsonb,
  error_message text,
  approved_at timestamp,
  approved_by_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  analyzed_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prospect_intelligence_priority_idx ON prospect_intelligence (priority);
CREATE INDEX IF NOT EXISTS prospect_intelligence_lead_score_idx ON prospect_intelligence (lead_score DESC);
CREATE INDEX IF NOT EXISTS prospect_intelligence_import_job_idx ON prospect_intelligence (import_job_id);
CREATE INDEX IF NOT EXISTS prospect_intelligence_status_idx ON prospect_intelligence (analysis_status);

CREATE TABLE IF NOT EXISTS prospect_intelligence_jobs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id varchar NOT NULL REFERENCES prospect_import_jobs(id) ON DELETE CASCADE,
  initiated_by_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  contact_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  progress_current integer DEFAULT 0,
  progress_total integer DEFAULT 0,
  result_analyzed integer DEFAULT 0,
  result_high_priority integer DEFAULT 0,
  result_medium_priority integer DEFAULT 0,
  result_low_priority integer DEFAULT 0,
  result_needs_review integer DEFAULT 0,
  result_errors integer DEFAULT 0,
  ai_model text,
  prompt_tokens_total integer DEFAULT 0,
  completion_tokens_total integer DEFAULT 0,
  error_message text,
  created_at timestamp DEFAULT now(),
  started_at timestamp,
  completed_at timestamp
);

CREATE INDEX IF NOT EXISTS prospect_intelligence_jobs_import_idx
  ON prospect_intelligence_jobs (import_job_id, created_at DESC);
