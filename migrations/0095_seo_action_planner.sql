-- Phase 2B is research and approval only. No table below can publish site content.
CREATE TABLE IF NOT EXISTS seo_analysis_runs (
 id varchar PRIMARY KEY DEFAULT gen_random_uuid(), property_id text NOT NULL, status text NOT NULL DEFAULT 'running', trigger text NOT NULL DEFAULT 'manual',
 lease_token text NOT NULL, lease_expires_at timestamp NOT NULL, diagnostics jsonb NOT NULL DEFAULT '{}'::jsonb,
 failure_category text, started_at timestamp NOT NULL DEFAULT now(), completed_at timestamp
);
CREATE UNIQUE INDEX IF NOT EXISTS seo_analysis_runs_active_property_uidx ON seo_analysis_runs(property_id) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS seo_analysis_runs_property_started_idx ON seo_analysis_runs(property_id, started_at);
CREATE TABLE IF NOT EXISTS seo_opportunities (
 id varchar PRIMARY KEY DEFAULT gen_random_uuid(), property_id text NOT NULL, cluster_key varchar(64) NOT NULL, target_page text NOT NULL,
 query_cluster jsonb NOT NULL, opportunity_type text NOT NULL, current_metrics jsonb NOT NULL, previous_metrics jsonb NOT NULL,
 priority_score double precision NOT NULL, confidence_score double precision NOT NULL, estimated_upside double precision NOT NULL,
 reason text NOT NULL, evidence jsonb NOT NULL, detected_at timestamp NOT NULL DEFAULT now(), refreshed_at timestamp NOT NULL DEFAULT now()
);
-- 0099 deliberately permits historical opportunities for the same cluster. Using
-- the final non-unique index here keeps this startup migration repeatable once
-- those rows exist, rather than trying to recreate the retired unique index.
CREATE INDEX IF NOT EXISTS seo_opportunities_property_cluster_idx ON seo_opportunities(property_id, cluster_key, detected_at);
CREATE TABLE IF NOT EXISTS seo_page_snapshots (
 id varchar PRIMARY KEY DEFAULT gen_random_uuid(), property_id text NOT NULL, page_url text NOT NULL, content_fingerprint varchar(64) NOT NULL,
 title text, meta_description text, canonical_url text, headings jsonb NOT NULL DEFAULT '[]'::jsonb, sections jsonb NOT NULL DEFAULT '[]'::jsonb,
 structured_data jsonb NOT NULL DEFAULT '[]'::jsonb, internal_links jsonb NOT NULL DEFAULT '[]'::jsonb, deficiencies jsonb NOT NULL DEFAULT '[]'::jsonb,
 metrics jsonb NOT NULL DEFAULT '{}'::jsonb, captured_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS seo_page_snapshots_property_page_hash_idx ON seo_page_snapshots(property_id, content_fingerprint);
CREATE TABLE IF NOT EXISTS seo_competitor_config (
 id varchar PRIMARY KEY DEFAULT gen_random_uuid(), property_id text NOT NULL, domain text NOT NULL, page_url text, enabled boolean NOT NULL DEFAULT true, created_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS seo_competitor_config_property_domain_page_uidx ON seo_competitor_config(property_id, domain, COALESCE(page_url, ''));
CREATE TABLE IF NOT EXISTS seo_competitor_snapshots (
 id varchar PRIMARY KEY DEFAULT gen_random_uuid(), property_id text NOT NULL, query_hash varchar(64) NOT NULL, page_hash varchar(64) NOT NULL, url text NOT NULL, domain text NOT NULL,
 result_position integer, signals jsonb NOT NULL, status text NOT NULL, failure_category text, fetched_at timestamp NOT NULL DEFAULT now(), expires_at timestamp NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS seo_competitor_snapshots_cache_uidx ON seo_competitor_snapshots(property_id, query_hash, page_hash);
CREATE TABLE IF NOT EXISTS seo_actions (
 id varchar PRIMARY KEY DEFAULT gen_random_uuid(), property_id text NOT NULL, opportunity_id varchar NOT NULL REFERENCES seo_opportunities(id), idempotency_key varchar(64) NOT NULL,
 target_page text NOT NULL, query_cluster jsonb NOT NULL, action_type text NOT NULL, status text NOT NULL DEFAULT 'detected', risk text NOT NULL,
 confidence double precision NOT NULL, expected_benefit text NOT NULL, original_content_fingerprint varchar(64) NOT NULL,
 current_version integer NOT NULL DEFAULT 1, approved_by varchar, approved_at timestamp, rejected_by varchar, rejected_at timestamp, rejection_reason text,
 stale_at timestamp, created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS seo_actions_open_idempotency_uidx ON seo_actions(property_id, idempotency_key) WHERE status IN ('detected','researching','proposed','approved');
CREATE INDEX IF NOT EXISTS seo_actions_property_status_idx ON seo_actions(property_id, status, updated_at);
CREATE TABLE IF NOT EXISTS seo_action_versions (
 id varchar PRIMARY KEY DEFAULT gen_random_uuid(), action_id varchar NOT NULL REFERENCES seo_actions(id), version integer NOT NULL, proposal jsonb NOT NULL,
 ai_provider text NOT NULL, ai_model text NOT NULL, prompt_version text NOT NULL, created_at timestamp NOT NULL DEFAULT now(), UNIQUE(action_id, version)
);
CREATE TABLE IF NOT EXISTS seo_action_evidence (
 id varchar PRIMARY KEY DEFAULT gen_random_uuid(), action_id varchar NOT NULL REFERENCES seo_actions(id), evidence_type text NOT NULL, reference_id varchar NOT NULL,
 summary text NOT NULL, created_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS seo_action_events (
 id bigserial PRIMARY KEY, action_id varchar NOT NULL REFERENCES seo_actions(id), from_status text, to_status text NOT NULL, actor_id varchar,
 reason text, safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS seo_action_events_action_created_idx ON seo_action_events(action_id, created_at);
