-- RGE Inventory Intelligence — sync alerts on listings + contact opportunities (Phase 4, internal only)

ALTER TABLE inventory_listings
  ADD COLUMN IF NOT EXISTS sync_alert_status text NOT NULL DEFAULT 'existing',
  ADD COLUMN IF NOT EXISTS previous_price_cents integer,
  ADD COLUMN IF NOT EXISTS last_price_change_at timestamptz;

COMMENT ON COLUMN inventory_listings.sync_alert_status IS 'Latest sync classification: new | existing | price_changed';
COMMENT ON COLUMN inventory_listings.previous_price_cents IS 'Prior list price in cents when price_changed on last sync';
COMMENT ON COLUMN inventory_listings.last_price_change_at IS 'When list price last changed between syncs';

CREATE INDEX IF NOT EXISTS inventory_listings_user_sync_alert_idx
  ON inventory_listings (user_id, sync_alert_status)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS contact_inventory_opportunities (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id varchar NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  listing_id varchar NOT NULL REFERENCES inventory_listings(id) ON DELETE CASCADE,
  opportunity_type text NOT NULL,
  score integer NOT NULL,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  previous_price_cents integer,
  current_price_cents integer,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (contact_id, listing_id, opportunity_type),
  CONSTRAINT contact_inventory_opportunities_type_check
    CHECK (opportunity_type IN ('new_listing', 'price_reduced')),
  CONSTRAINT contact_inventory_opportunities_status_check
    CHECK (status IN ('new', 'viewed', 'saved', 'dismissed'))
);

CREATE INDEX IF NOT EXISTS contact_inventory_opportunities_contact_idx
  ON contact_inventory_opportunities (contact_id);

CREATE INDEX IF NOT EXISTS contact_inventory_opportunities_contact_status_idx
  ON contact_inventory_opportunities (contact_id, status);

CREATE INDEX IF NOT EXISTS contact_inventory_opportunities_user_idx
  ON contact_inventory_opportunities (user_id);

COMMENT ON TABLE contact_inventory_opportunities IS 'Internal inventory match opportunities for RGE Copilot (Phase 4 — no outbound messaging)';
