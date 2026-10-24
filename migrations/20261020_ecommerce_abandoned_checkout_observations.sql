-- Staging-only until separately reviewed and applied. No automatic migration.
-- Stores checkout GIDs and status only: no recovery URLs, names, contacts, phones, tokens or messages.
-- Not a send queue; 'observed' only authorizes a later Shopify recheck.
CREATE TABLE IF NOT EXISTS ecommerce_abandoned_checkout_observations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id VARCHAR(128) NOT NULL,
  shop VARCHAR(255) NOT NULL,
  checkout_gid VARCHAR(128) NOT NULL,
  last_activity_at TIMESTAMPTZ NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  recovery_url_available BOOLEAN NOT NULL DEFAULT FALSE,
  next_review_at TIMESTAMPTZ,
  first_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ecommerce_checkout_observations_unique UNIQUE (account_id,shop,checkout_gid),
  CONSTRAINT ecommerce_checkout_observations_review_check CHECK
    ((completed AND next_review_at IS NULL) OR (NOT completed AND next_review_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS ecommerce_checkout_observations_due_idx
  ON ecommerce_abandoned_checkout_observations (next_review_at,id)
  WHERE completed=FALSE AND recovery_url_available=TRUE;
