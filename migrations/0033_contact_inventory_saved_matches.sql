-- RGE Inventory Intelligence — realtor-saved listing matches per contact (internal, no outbound messaging)
CREATE TABLE IF NOT EXISTS contact_inventory_saved_matches (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id varchar NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  listing_id varchar NOT NULL REFERENCES inventory_listings(id) ON DELETE CASCADE,
  match_score integer,
  match_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (contact_id, listing_id)
);

CREATE INDEX IF NOT EXISTS contact_inventory_saved_matches_contact_idx
  ON contact_inventory_saved_matches (contact_id);

CREATE INDEX IF NOT EXISTS contact_inventory_saved_matches_user_idx
  ON contact_inventory_saved_matches (user_id);

COMMENT ON TABLE contact_inventory_saved_matches IS 'Internal saved inventory matches for RGE Copilot (Phase 3 — no customer messaging)';
