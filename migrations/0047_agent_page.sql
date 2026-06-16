-- Public agent marketing page (Phase 1 MVP)
ALTER TABLE ai_business_knowledge ADD COLUMN IF NOT EXISTS agent_page_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE ai_business_knowledge ADD COLUMN IF NOT EXISTS agent_page_slug text;
ALTER TABLE ai_business_knowledge ADD COLUMN IF NOT EXISTS agent_page_display_name text;
ALTER TABLE ai_business_knowledge ADD COLUMN IF NOT EXISTS agent_page_bio text;
ALTER TABLE ai_business_knowledge ADD COLUMN IF NOT EXISTS agent_page_market_area text;
ALTER TABLE ai_business_knowledge ADD COLUMN IF NOT EXISTS agent_page_preferred_lead_capture text NOT NULL DEFAULT 'webchat';
ALTER TABLE ai_business_knowledge ADD COLUMN IF NOT EXISTS agent_page_show_home_value_cta boolean NOT NULL DEFAULT true;
ALTER TABLE ai_business_knowledge ADD COLUMN IF NOT EXISTS agent_page_analytics jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS ai_business_knowledge_agent_page_slug_lower
  ON ai_business_knowledge (lower(agent_page_slug))
  WHERE agent_page_slug IS NOT NULL;

COMMENT ON COLUMN ai_business_knowledge.agent_page_enabled IS 'Per-workspace opt-in for /agents/:slug';
COMMENT ON COLUMN ai_business_knowledge.agent_page_slug IS 'URL slug for public agent page';
