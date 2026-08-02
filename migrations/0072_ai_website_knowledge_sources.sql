-- Persist the guided Website Knowledge source URLs so rescans stay additive.
-- Additive and defaulted: existing rows keep their summary and source URL list untouched.
ALTER TABLE ai_business_knowledge
  ADD COLUMN IF NOT EXISTS website_knowledge_sources jsonb NOT NULL DEFAULT '[]'::jsonb;
