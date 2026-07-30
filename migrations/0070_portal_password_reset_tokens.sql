-- Portal password reset tokens (Partner + Sales) + optional salesperson password hash.
-- Additive and safe for existing accounts.
--
-- Notes:
-- - No FK to partners/salespeople: avoids cascading deletes into auth history and keeps
--   reset rows durable if an account row is archived/deleted by admin tooling.
-- - account_type CHECK enforces partner | salesperson only.
-- - Expired unused tokens are purged opportunistically on forgot-password requests
--   (see server/portalPasswordReset.ts). Used tokens remain as audit rows.

CREATE TABLE IF NOT EXISTS portal_password_reset_tokens (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  account_type TEXT NOT NULL,
  account_id VARCHAR NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT portal_password_reset_tokens_account_type_check
    CHECK (account_type IN ('partner', 'salesperson'))
);

CREATE UNIQUE INDEX IF NOT EXISTS portal_password_reset_tokens_token_hash_uidx
  ON portal_password_reset_tokens (token_hash);

CREATE INDEX IF NOT EXISTS portal_password_reset_tokens_account_idx
  ON portal_password_reset_tokens (account_type, account_id);

CREATE INDEX IF NOT EXISTS portal_password_reset_tokens_active_idx
  ON portal_password_reset_tokens (account_type, account_id, used_at, expires_at);

ALTER TABLE salespeople
  ADD COLUMN IF NOT EXISTS password_hash TEXT;
