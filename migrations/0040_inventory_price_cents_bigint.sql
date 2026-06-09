-- Luxury listings exceed int32 cents max (~$21.47M). Bridge sync failed on R11143892 ($26.5M).
ALTER TABLE inventory_listings
  ALTER COLUMN price_cents TYPE bigint USING price_cents::bigint,
  ALTER COLUMN previous_price_cents TYPE bigint USING previous_price_cents::bigint;

ALTER TABLE contact_inventory_opportunities
  ALTER COLUMN previous_price_cents TYPE bigint USING previous_price_cents::bigint,
  ALTER COLUMN current_price_cents TYPE bigint USING current_price_cents::bigint;

COMMENT ON COLUMN inventory_listings.price_cents IS 'List price in integer cents (bigint for luxury listings > ~$21M)';
