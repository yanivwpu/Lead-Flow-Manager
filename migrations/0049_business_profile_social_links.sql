-- Optional social profile links (Agent Page + business profile)
ALTER TABLE ai_business_knowledge ADD COLUMN IF NOT EXISTS facebook_url text;
ALTER TABLE ai_business_knowledge ADD COLUMN IF NOT EXISTS instagram_url text;
ALTER TABLE ai_business_knowledge ADD COLUMN IF NOT EXISTS linkedin_url text;
ALTER TABLE ai_business_knowledge ADD COLUMN IF NOT EXISTS youtube_url text;

COMMENT ON COLUMN ai_business_knowledge.facebook_url IS 'Public Facebook profile or page URL';
COMMENT ON COLUMN ai_business_knowledge.instagram_url IS 'Public Instagram profile URL';
COMMENT ON COLUMN ai_business_knowledge.linkedin_url IS 'Public LinkedIn profile or company URL';
COMMENT ON COLUMN ai_business_knowledge.youtube_url IS 'Public YouTube channel URL';
