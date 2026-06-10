-- SEO-friendly public share URLs (/share/listings/:slug)
ALTER TABLE inventory_listings ADD COLUMN IF NOT EXISTS public_slug text;

CREATE UNIQUE INDEX IF NOT EXISTS inventory_listings_public_slug_unique
  ON inventory_listings (public_slug)
  WHERE public_slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS inventory_listings_public_slug_lookup_idx
  ON inventory_listings (public_slug)
  WHERE public_slug IS NOT NULL;

COMMENT ON COLUMN inventory_listings.public_slug IS 'Stable SEO slug for public share page; frozen after first assignment';
