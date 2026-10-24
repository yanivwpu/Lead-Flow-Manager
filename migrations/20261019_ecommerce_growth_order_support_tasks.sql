-- Phase 2 staging-only internal Shopify order-support task outbox.
-- Apply ONLY to the verified isolated staging PostgreSQL database after review.
-- No customer payloads, addresses, tokens, checkout state, or message instructions.
-- Merchant opt-in defaults OFF; operator release gate defaults OFF in code.
CREATE TABLE IF NOT EXISTS ecommerce_growth_order_task_settings (
  account_id VARCHAR(128) NOT NULL,
  shop VARCHAR(255) NOT NULL,
  tasks_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (account_id, shop)
);

CREATE TABLE IF NOT EXISTS ecommerce_growth_order_support_tasks (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id BIGINT NOT NULL REFERENCES ecommerce_growth_event_inbox(id) ON DELETE CASCADE,
  account_id VARCHAR(128) NOT NULL,
  shop VARCHAR(255) NOT NULL,
  contact_id VARCHAR NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  state VARCHAR(16) NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id)
);
CREATE INDEX IF NOT EXISTS ecommerce_growth_order_support_open_idx
  ON ecommerce_growth_order_support_tasks (account_id, shop, created_at, id)
  WHERE state = 'open';
