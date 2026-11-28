ALTER TABLE ai_business_knowledge ADD COLUMN IF NOT EXISTS agent_page_language text NOT NULL DEFAULT 'en';
ALTER TABLE agent_neighborhood_pages ADD COLUMN IF NOT EXISTS public_language text NOT NULL DEFAULT 'en';
