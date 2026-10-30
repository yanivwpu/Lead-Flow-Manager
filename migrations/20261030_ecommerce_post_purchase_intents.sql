-- REVIEW ONLY. Never auto-applied at startup. Requires existing event inbox.
-- No payloads, messages, phone numbers, names, URLs or provider credentials.
CREATE TABLE IF NOT EXISTS ecommerce_post_purchase_consents (
  account_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shop VARCHAR(255) NOT NULL,
  recipient_hmac CHAR(64) NOT NULL,
  purpose VARCHAR(32) NOT NULL CHECK (purpose IN ('orderConfirmation','fulfillmentUpdate','cancellation','reviewRequest','repeatPurchase','winBack')),
  contact_id VARCHAR REFERENCES contacts(id) ON DELETE CASCADE,
  customer_gid VARCHAR(128),
  channel VARCHAR(16) NOT NULL DEFAULT 'whatsapp' CHECK (channel='whatsapp'),
  evidence_source VARCHAR(64) NOT NULL DEFAULT 'verified_whatsapp_explicit_opt_in' CHECK(evidence_source='verified_whatsapp_explicit_opt_in'),
  granted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  last_inbound_at TIMESTAMPTZ NOT NULL,
  last_wamid VARCHAR(256) NOT NULL,
  PRIMARY KEY(account_id,shop,recipient_hmac,purpose),
  CHECK(granted_at IS NULL OR (contact_id IS NOT NULL AND customer_gid IS NOT NULL AND customer_gid ~ '^gid://shopify/Customer/[1-9][0-9]{0,19}$')),
  CHECK(granted_at IS NOT NULL OR revoked_at IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS ecommerce_post_purchase_orders (
  account_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  installation_id VARCHAR NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  shop VARCHAR(255) NOT NULL,
  order_gid VARCHAR(128) NOT NULL CHECK(order_gid ~ '^gid://shopify/Order/[1-9][0-9]{0,19}$'),
  customer_gid VARCHAR(128) NOT NULL CHECK(customer_gid ~ '^gid://shopify/Customer/[1-9][0-9]{0,19}$'),
  status VARCHAR(16) NOT NULL CHECK(status IN ('open','fulfilled','cancelled')),
  source_updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY(account_id,shop,order_gid),
  UNIQUE(account_id,shop,order_gid,customer_gid,installation_id)
);
CREATE TABLE IF NOT EXISTS ecommerce_post_purchase_intents (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  installation_id VARCHAR NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  shop VARCHAR(255) NOT NULL,
  order_gid VARCHAR(128) NOT NULL,
  customer_gid VARCHAR(128) NOT NULL,
  contact_id VARCHAR REFERENCES contacts(id) ON DELETE CASCADE,
  event_id BIGINT NOT NULL REFERENCES ecommerce_growth_event_inbox(id) ON DELETE CASCADE,
  topic VARCHAR(64) NOT NULL CHECK(topic IN ('orders/create','orders/fulfilled','orders/cancelled')),
  occurred_at TIMESTAMPTZ NOT NULL,
  journey VARCHAR(32) NOT NULL CHECK(journey IN ('orderConfirmation','fulfillmentUpdate','cancellation','reviewRequest','repeatPurchase','winBack')),
  due_at TIMESTAMPTZ NOT NULL,
  state VARCHAR(16) NOT NULL CHECK(state IN ('scheduled','blocked','preview_ready','suppressed')),
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(reasons)='array'),
  template_id VARCHAR REFERENCES message_templates(id) ON DELETE SET NULL,
  checked_at TIMESTAMPTZ,
  next_review_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id,shop,order_gid,journey),
  FOREIGN KEY(account_id,shop,order_gid,customer_gid,installation_id) REFERENCES ecommerce_post_purchase_orders(account_id,shop,order_gid,customer_gid,installation_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ecommerce_post_purchase_due_idx
  ON ecommerce_post_purchase_intents(account_id,shop,next_review_at,id) WHERE state<>'suppressed';
