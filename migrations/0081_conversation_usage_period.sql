-- Free conversation quota period (independent of Stripe).
-- Counter-only: does not delete conversations or messages.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS conversation_usage_period_start timestamp;
