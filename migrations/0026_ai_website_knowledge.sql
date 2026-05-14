-- AI Brain Website Knowledge (V1): URL, summarized text, fetched source URLs, last save time.

ALTER TABLE ai_business_knowledge ADD COLUMN IF NOT EXISTS website_knowledge_url text;
ALTER TABLE ai_business_knowledge ADD COLUMN IF NOT EXISTS website_knowledge_summary text;
ALTER TABLE ai_business_knowledge ADD COLUMN IF NOT EXISTS website_knowledge_source_urls jsonb DEFAULT '[]'::jsonb;
ALTER TABLE ai_business_knowledge ADD COLUMN IF NOT EXISTS website_knowledge_updated_at timestamp;
