-- REVIEW-ONLY staging migration. Do NOT deploy without Shopify privacy redaction hooks.
-- No raw phone numbers, messages, checkout recovery URLs, Meta tokens, or customer names.
-- The consent table has no public setter. Populate only from independently verified
-- WhatsApp opt-in evidence via a separately reviewed capture flow.
CREATE TABLE IF NOT EXISTS ecommerce_whatsapp_recovery_consents (
  account_id VARCHAR(128) NOT NULL,
  shop VARCHAR(255) NOT NULL,
  contact_id VARCHAR(128) NOT NULL,
  shopify_customer_gid VARCHAR(128) NOT NULL,
  purpose VARCHAR(40) NOT NULL DEFAULT 'checkout_recovery' CHECK (purpose='checkout_recovery'),
  channel VARCHAR(16) NOT NULL DEFAULT 'whatsapp' CHECK (channel='whatsapp'),
  evidence_source VARCHAR(64) NOT NULL CHECK (evidence_source='verified_whatsapp_explicit_opt_in'),
  recipient_hmac CHAR(64) NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (account_id, shop, contact_id)
);
CREATE INDEX IF NOT EXISTS ecommerce_recovery_consents_customer_idx
  ON ecommerce_whatsapp_recovery_consents(account_id,shop,shopify_customer_gid)
  WHERE revoked_at IS NULL;

-- Outbox is NOT consumed by any live worker. A claim is at-most-once:
-- crashed/uncertain provider accepts are reconciled manually, not auto-retried.
CREATE TABLE IF NOT EXISTS ecommerce_checkout_recovery_outbox (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  intent_id BIGINT NOT NULL REFERENCES ecommerce_checkout_recovery_intents(id) ON DELETE CASCADE,
  account_id VARCHAR(128) NOT NULL,
  shop VARCHAR(255) NOT NULL,
  checkout_gid VARCHAR(128) NOT NULL,
  contact_id VARCHAR(128) NOT NULL,
  template_id VARCHAR(128) NOT NULL,
  state VARCHAR(16) NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending','claimed','accepted','uncertain','suppressed')),
  claim_token UUID,
  claimed_at TIMESTAMPTZ,
  provider_message_id VARCHAR(256),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ecommerce_checkout_recovery_outbox_intent_unique UNIQUE(intent_id),
  CONSTRAINT ecommerce_checkout_recovery_outbox_key_unique
    UNIQUE(account_id,shop,checkout_gid),
  CONSTRAINT ecommerce_checkout_recovery_outbox_claim_consistency CHECK
    ((state IN ('claimed','accepted','uncertain') AND claim_token IS NOT NULL)
      OR (state IN ('pending','suppressed'))),
  CONSTRAINT ecommerce_checkout_recovery_outbox_provider_consistency CHECK
    (provider_message_id IS NULL OR state='accepted')
);
CREATE INDEX IF NOT EXISTS ecommerce_checkout_recovery_outbox_pending_idx
  ON ecommerce_checkout_recovery_outbox(account_id,shop,id) WHERE state='pending';
