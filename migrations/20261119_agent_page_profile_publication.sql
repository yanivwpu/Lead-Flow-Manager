-- Preserve old live profiles and leave previously non-public profiles private.
DO $$
BEGIN
  ALTER TABLE ai_business_knowledge ADD COLUMN IF NOT EXISTS agent_page_profile_enabled boolean;
  UPDATE ai_business_knowledge
    SET agent_page_profile_enabled = agent_page_enabled
      AND publish_listings_publicly
      AND COALESCE(trim(agent_page_slug), '') <> ''
    WHERE agent_page_profile_enabled IS NULL;
  ALTER TABLE ai_business_knowledge
    ALTER COLUMN agent_page_profile_enabled SET DEFAULT false,
    ALTER COLUMN agent_page_profile_enabled SET NOT NULL;
END $$;
