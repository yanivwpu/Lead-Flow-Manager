-- AI Brain Phase 1: structured, source-backed business facts.
-- Additive only. No existing column is altered or dropped, so V1 Website Knowledge
-- (website_knowledge_summary + website_knowledge_sources) keeps working untouched.

ALTER TABLE ai_business_knowledge
  ADD COLUMN IF NOT EXISTS knowledge_v2_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE ai_business_knowledge
  ADD COLUMN IF NOT EXISTS knowledge_freshness_policy jsonb NOT NULL DEFAULT '{}'::jsonb;

-- One row per page the workspace asked us to learn from. Raw page text is never stored.
CREATE TABLE IF NOT EXISTS ai_website_knowledge_sources (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url text NOT NULL,
  normalized_url text NOT NULL,
  slot_key text,
  title text,
  custom_label text,
  detected_type text NOT NULL DEFAULT 'other',
  status text NOT NULL DEFAULT 'pending',
  is_enabled boolean NOT NULL DEFAULT true,
  content_hash text,
  char_count integer NOT NULL DEFAULT 0,
  scan_version integer NOT NULL DEFAULT 0,
  error_code text,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_added_at timestamp DEFAULT now(),
  last_scanned_at timestamp,
  last_successful_scan_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ai_website_knowledge_sources_user_url_idx
  ON ai_website_knowledge_sources (user_id, normalized_url);

CREATE INDEX IF NOT EXISTS ai_website_knowledge_sources_user_enabled_idx
  ON ai_website_knowledge_sources (user_id, is_enabled);

-- Structured facts. Scanning writes 'draft'; only 'published' rows reach live AI.
CREATE TABLE IF NOT EXISTS business_knowledge_facts (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_id varchar REFERENCES ai_website_knowledge_sources(id) ON DELETE SET NULL,
  fact_type text NOT NULL,
  fact_key text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  state text NOT NULL DEFAULT 'draft',
  proposed_action text,
  origin text NOT NULL DEFAULT 'ai_extracted',
  confidence double precision NOT NULL DEFAULT 0.5,
  is_pinned boolean NOT NULL DEFAULT false,
  user_edited boolean NOT NULL DEFAULT false,
  conflict_group text,
  conflict_resolution text,
  superseded_by_fact_id varchar,
  source_url text,
  source_title text,
  excerpt text,
  provenance jsonb NOT NULL DEFAULT '[]'::jsonb,
  first_seen_at timestamp DEFAULT now(),
  last_verified_at timestamp DEFAULT now(),
  published_at timestamp,
  retired_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS business_knowledge_facts_user_state_type_idx
  ON business_knowledge_facts (user_id, state, fact_type);

CREATE INDEX IF NOT EXISTS business_knowledge_facts_user_fact_key_idx
  ON business_knowledge_facts (user_id, fact_key);

CREATE INDEX IF NOT EXISTS business_knowledge_facts_user_source_idx
  ON business_knowledge_facts (user_id, source_id);

-- A fact key may hold at most one live published value and one proposed draft.
-- Retired rows are exempt so history accumulates freely.
CREATE UNIQUE INDEX IF NOT EXISTS business_knowledge_facts_user_key_state_live_idx
  ON business_knowledge_facts (user_id, fact_key, state)
  WHERE state IN ('draft', 'published');

-- Leased extraction jobs so scanning runs outside the HTTP request.
CREATE TABLE IF NOT EXISTS ai_knowledge_scan_jobs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  source_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  item_results jsonb NOT NULL DEFAULT '{}'::jsonb,
  lease_owner text,
  lease_expires_at timestamp,
  progress_current integer NOT NULL DEFAULT 0,
  progress_total integer NOT NULL DEFAULT 0,
  facts_proposed integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamp DEFAULT now(),
  started_at timestamp,
  completed_at timestamp,
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_knowledge_scan_jobs_claim_idx
  ON ai_knowledge_scan_jobs (status, lease_expires_at, created_at);

CREATE INDEX IF NOT EXISTS ai_knowledge_scan_jobs_user_created_idx
  ON ai_knowledge_scan_jobs (user_id, created_at);
