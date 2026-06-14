-- Seller Lead Engine Phase 1 — structured seller preference memory per contact
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS seller_preference_profile jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN contacts.seller_preference_profile IS
  'Structured seller preference profile (schemaVersion 1): listing intake fields separate from buyer preferences';
