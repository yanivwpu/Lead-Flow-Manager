-- E-commerce Growth Engine delivery inbox (review-only; not automatically applied).
-- No webhook payloads, customer PII, credentials, or outbound message instructions.
CREATE TABLE IF NOT EXISTS ecommerce_growth_event_inbox (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id VARCHAR(128) NOT NULL,
  shop VARCHAR(255) NOT NULL,
  topic VARCHAR(64) NOT NULL,
  delivery_id VARCHAR(256) NOT NULL,
  journey VARCHAR(32) NOT NULL,
  state VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','reviewed','ignored')),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, shop, topic, delivery_id)
);
CREATE INDEX IF NOT EXISTS ecommerce_growth_event_inbox_pending_idx
 ON ecommerce_growth_event_inbox (account_id, received_at, id) WHERE state='pending';
