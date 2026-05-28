-- RGE Inventory Connector — normalized listing inventory per source
CREATE TABLE IF NOT EXISTS inventory_listings (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_id varchar NOT NULL REFERENCES inventory_sources(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_listing_id text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  price_cents integer,
  currency text NOT NULL DEFAULT 'USD',
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  zip text,
  country text DEFAULT 'US',
  latitude double precision,
  longitude double precision,
  beds numeric(4, 1),
  baths numeric(4, 1),
  property_type text,
  description text,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  listing_url text,
  source_updated_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now(),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (source_id, provider_listing_id)
);

CREATE INDEX IF NOT EXISTS inventory_listings_user_status_idx ON inventory_listings (user_id, status);
CREATE INDEX IF NOT EXISTS inventory_listings_user_city_idx ON inventory_listings (user_id, city);
CREATE INDEX IF NOT EXISTS inventory_listings_user_price_idx ON inventory_listings (user_id, price_cents) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS inventory_listings_source_synced_idx ON inventory_listings (source_id, synced_at);

COMMENT ON TABLE inventory_listings IS 'Normalized MLS/IDX listings for RGE inventory intelligence (matching in later phases)';
COMMENT ON COLUMN inventory_listings.price_cents IS 'List price in integer cents';
