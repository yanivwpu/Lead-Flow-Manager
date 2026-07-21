-- Prospect AI outcome tracking (Won / Lost / pipeline stages)
-- Additive only. Manual Neon apply required (not auto-run on Railway).

CREATE TABLE IF NOT EXISTS prospect_ai_outcomes (
  contact_id varchar PRIMARY KEY REFERENCES contacts(id) ON DELETE CASCADE,
  workspace_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prospect_outcome text NOT NULL DEFAULT 'active',
  outcome_updated_at timestamp DEFAULT now(),
  outcome_updated_by_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  won_at timestamp,
  won_by_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  source_engine text NOT NULL DEFAULT 'prospect_ai',
  discovery_result_id varchar,
  discovery_search_id varchar,
  prospect_intelligence_contact_id varchar,
  campaign_enrollment_id varchar,
  first_outreach_at timestamp,
  first_reply_at timestamp,
  qualified_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prospect_ai_outcomes_workspace_outcome_idx
  ON prospect_ai_outcomes (workspace_user_id, prospect_outcome);

CREATE INDEX IF NOT EXISTS prospect_ai_outcomes_workspace_won_at_idx
  ON prospect_ai_outcomes (workspace_user_id, won_at DESC);

CREATE INDEX IF NOT EXISTS prospect_ai_outcomes_workspace_updated_idx
  ON prospect_ai_outcomes (workspace_user_id, outcome_updated_at DESC);
