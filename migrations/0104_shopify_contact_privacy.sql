CREATE TABLE IF NOT EXISTS shopify_merchant_contacts (
  user_id varchar PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  canonical_shop text NOT NULL,
  capture_status text,
  capture_source text,
  capture_at timestamp,
  support_email text,
  support_source text,
  support_confirmed_at timestamp,
  support_dismissed_at timestamp
);
CREATE INDEX IF NOT EXISTS shopify_merchant_contacts_shop_idx ON shopify_merchant_contacts(canonical_shop);
-- No contact addresses, tokens, shop domains, or user IDs in external-erasure tasks.
-- Retain only until the governed-processor purge is verified; see the privacy runbook.
CREATE TABLE IF NOT EXISTS shopify_privacy_erasure_tasks (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_at timestamp NOT NULL DEFAULT NOW(),
  scope_from timestamp,
  scope_to timestamp NOT NULL DEFAULT NOW(),
  status text NOT NULL DEFAULT 'pending_external',
  completed_at timestamp
);
