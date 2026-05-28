-- RGE Inventory Intelligence Phase 1 — structured buyer preference memory per contact
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS buyer_preference_profile jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN contacts.buyer_preference_profile IS
  'Structured buyer preference profile (schemaVersion 1): explicit/inferred fields with confidence';
