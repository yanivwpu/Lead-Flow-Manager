ALTER TABLE ai_business_knowledge ADD COLUMN IF NOT EXISTS agent_page_use_custom_bio boolean NOT NULL DEFAULT false;

UPDATE ai_business_knowledge
SET agent_page_use_custom_bio = true
WHERE agent_page_bio IS NOT NULL AND trim(agent_page_bio) <> '';
