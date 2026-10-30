-- REVIEW ONLY — Post-purchase delivery fence. NOT part of startup/bootstrap migrations.
-- Requires migrations/20261030_ecommerce_post_purchase_intents.sql.
-- Does not enable delivery, schedule work, or grant consent. No customer payload or tokens stored.
-- This schema is intentionally separate from checkout recovery's existing outbox.
CREATE TABLE IF NOT EXISTS ecommerce_post_purchase_outbox (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  intent_id BIGINT NOT NULL REFERENCES ecommerce_post_purchase_intents(id) ON DELETE CASCADE,
  account_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  installation_id VARCHAR NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  shop VARCHAR(255) NOT NULL,
  order_gid VARCHAR(128) NOT NULL,
  journey VARCHAR(32) NOT NULL CHECK (journey IN
    ('orderConfirmation','fulfillmentUpdate','cancellation','reviewRequest','repeatPurchase','winBack')),
  contact_id VARCHAR NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  template_id VARCHAR NOT NULL REFERENCES message_templates(id) ON DELETE RESTRICT,
  state VARCHAR(16) NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending','claimed','accepted','uncertain','suppressed')),
  claim_token UUID,
  claimed_at TIMESTAMPTZ,
  provider_attempted_at TIMESTAMPTZ,
  provider_message_id VARCHAR(256),
  meta_delivery_status VARCHAR(16)
    CHECK (meta_delivery_status IN ('sent','delivered','read','failed')),
  meta_delivery_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ecommerce_postpurchase_outbox_one_intent UNIQUE(intent_id),
  CONSTRAINT ecommerce_postpurchase_outbox_one_journey UNIQUE(account_id,shop,order_gid,journey),
  CONSTRAINT ecommerce_postpurchase_outbox_claim_consistency CHECK
    ((state IN ('claimed','accepted','uncertain') AND claim_token IS NOT NULL AND claimed_at IS NOT NULL)
      OR (state IN ('pending','suppressed') AND claim_token IS NULL AND claimed_at IS NULL)),
  CONSTRAINT ecommerce_postpurchase_outbox_attempt_consistency CHECK
    (provider_attempted_at IS NULL OR
      (state IN ('claimed','accepted','uncertain') AND claim_token IS NOT NULL)),
  CONSTRAINT ecommerce_postpurchase_outbox_accept_consistency CHECK
    (provider_message_id IS NULL OR state='accepted'),
  CONSTRAINT ecommerce_postpurchase_outbox_receipt_consistency CHECK
    (meta_delivery_status IS NULL OR provider_message_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS ecommerce_postpurchase_provider_message_unique
  ON ecommerce_post_purchase_outbox(account_id,provider_message_id)
  WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ecommerce_postpurchase_outbox_pending_idx
  ON ecommerce_post_purchase_outbox(account_id,shop,id) WHERE state='pending';

-- The application must ensure before insertion that intent/account/shop/order/journey,
-- installation, contact and template are all current and tenant-scoped. No send is safe
-- solely because a row exists. The sender must:
--   1) lock the intent, outbox, installation and privacy/suppression scope;
--   2) recheck consent, identity, order/purchase, pause, template and eligibility;
--   3) commit a unique claim BEFORE the provider call;
--   4) mark the durable attempt BEFORE outbound HTTP;
--   5) never retry claimed/uncertain/attempted rows without external reconciliation;
--   6) reconcile signed provider receipts without triggering a new attempt.
-- Do not use ON CONFLICT to clear claims or re-queue previous intents.
