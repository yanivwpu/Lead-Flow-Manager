-- Operation journal only; Shopify owns all cart/order/payment data.
-- Deliberately not installed by startup patches in the disabled Phase 2B foundation.
CREATE TABLE IF NOT EXISTS checkout_preparation_attempts (
  request_key text PRIMARY KEY,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id varchar NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('preparing','ready','failed','ambiguous')),
  encrypted_receipt text,
  retry_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS checkout_preparation_attempts_owner ON checkout_preparation_attempts(user_id,conversation_id);
