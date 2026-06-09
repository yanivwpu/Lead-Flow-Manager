-- Business Profile fields for public-facing branding (listing flyers, share pages)
ALTER TABLE ai_business_knowledge ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE ai_business_knowledge ADD COLUMN IF NOT EXISTS company_logo text;
ALTER TABLE ai_business_knowledge ADD COLUMN IF NOT EXISTS public_phone text;
ALTER TABLE ai_business_knowledge ADD COLUMN IF NOT EXISTS public_email text;
ALTER TABLE ai_business_knowledge ADD COLUMN IF NOT EXISTS public_website text;
ALTER TABLE ai_business_knowledge ADD COLUMN IF NOT EXISTS about_text text;

COMMENT ON COLUMN ai_business_knowledge.display_name IS 'Public display name (overrides users.name on flyers)';
COMMENT ON COLUMN ai_business_knowledge.company_logo IS 'Company/agency logo URL or data URL';
COMMENT ON COLUMN ai_business_knowledge.public_phone IS 'Public contact phone for listing flyers';
COMMENT ON COLUMN ai_business_knowledge.public_email IS 'Public contact email for listing flyers';
COMMENT ON COLUMN ai_business_knowledge.public_website IS 'Company website URL';
COMMENT ON COLUMN ai_business_knowledge.about_text IS 'Optional about me / about us blurb';
