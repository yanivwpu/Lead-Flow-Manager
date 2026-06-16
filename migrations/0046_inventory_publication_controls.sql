-- MLS public listing publication controls (workspace + per-listing opt-in)
ALTER TABLE ai_business_knowledge ADD COLUMN IF NOT EXISTS publish_listings_publicly boolean NOT NULL DEFAULT false;

ALTER TABLE inventory_listings ADD COLUMN IF NOT EXISTS publish_publicly boolean NOT NULL DEFAULT false;
ALTER TABLE inventory_listings ADD COLUMN IF NOT EXISTS published_at timestamptz;

COMMENT ON COLUMN ai_business_knowledge.publish_listings_publicly IS 'Workspace master switch for public /share listing pages';
COMMENT ON COLUMN inventory_listings.publish_publicly IS 'Per-listing opt-in for public share URL';
COMMENT ON COLUMN inventory_listings.published_at IS 'When publish_publicly was last enabled';
