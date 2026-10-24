-- PREVIEW ONLY: reviewed staging migration. No message sender reads this table.
-- No customer identifiers, recovery URLs, consent details, or message payloads.
CREATE TABLE IF NOT EXISTS ecommerce_checkout_recovery_intents (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id VARCHAR(128) NOT NULL,
  shop VARCHAR(255) NOT NULL,
  checkout_gid VARCHAR(128) NOT NULL,
  status VARCHAR(16) NOT NULL CHECK (status IN ('ready','suppressed')),
  verified_at TIMESTAMPTZ NOT NULL,
  prepared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ecommerce_checkout_recovery_intents_unique UNIQUE(account_id,shop,checkout_gid)
);
CREATE INDEX IF NOT EXISTS ecommerce_checkout_recovery_intents_staging_idx
  ON ecommerce_checkout_recovery_intents (account_id,shop,id) WHERE status='ready';
