-- Extended MLS/listing fields for public share flyer
ALTER TABLE inventory_listings ADD COLUMN IF NOT EXISTS square_feet integer;
ALTER TABLE inventory_listings ADD COLUMN IF NOT EXISTS year_built integer;
ALTER TABLE inventory_listings ADD COLUMN IF NOT EXISTS hoa_fee_cents integer;
ALTER TABLE inventory_listings ADD COLUMN IF NOT EXISTS property_subtype text;
ALTER TABLE inventory_listings ADD COLUMN IF NOT EXISTS listing_details jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN inventory_listings.square_feet IS 'Living area in square feet (RESO LivingArea)';
COMMENT ON COLUMN inventory_listings.year_built IS 'Year property was built (RESO YearBuilt)';
COMMENT ON COLUMN inventory_listings.hoa_fee_cents IS 'Monthly HOA/association fee in cents (RESO AssociationFee)';
COMMENT ON COLUMN inventory_listings.property_subtype IS 'RESO PropertySubType raw label';
COMMENT ON COLUMN inventory_listings.listing_details IS 'Flyer extras: parkingGarage, waterfront, pool, view';
