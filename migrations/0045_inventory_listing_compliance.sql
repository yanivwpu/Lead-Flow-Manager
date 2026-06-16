-- MLS public-display compliance snapshot (RESO fields at sync time)
ALTER TABLE inventory_listings ADD COLUMN IF NOT EXISTS listing_compliance jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN inventory_listings.listing_compliance IS 'MLS display permissions and attribution fields captured at sync (InternetDisplayYN, list office/agent, MLS source)';
