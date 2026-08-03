-- Public signup hardening: email verification, DB password-reset tokens, auth security audit.
-- Additive and safe for existing accounts.
--
-- Existing users are backfilled as verified (email_verified_at = created_at) so nobody
-- suddenly loses access. Trial fields are NOT modified.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS welcome_email_sent_at TIMESTAMP;

-- Backfill existing accounts as verified without touching pending public signups
-- (pending signups have no trial_started_at / paid plan / Shopify / onboarding).
UPDATE users
SET email_verified_at = COALESCE(created_at, NOW())
WHERE email_verified_at IS NULL
  AND (
    trial_started_at IS NOT NULL
    OR COALESCE(billing_plan, 'free') NOT IN ('free')
    OR COALESCE(subscription_plan, 'free') NOT IN ('free')
    OR shopify_shop IS NOT NULL
    OR onboarding_completed = true
  );

-- Mark welcome as already sent for verified existing accounts (prevents duplicate welcome).
UPDATE users
SET welcome_email_sent_at = COALESCE(created_at, NOW())
WHERE welcome_email_sent_at IS NULL
  AND email_verified_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS email_verification_tokens_token_hash_uidx
  ON email_verification_tokens (token_hash);

CREATE INDEX IF NOT EXISTS email_verification_tokens_user_idx
  ON email_verification_tokens (user_id);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS password_reset_tokens_token_hash_uidx
  ON password_reset_tokens (token_hash);

CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx
  ON password_reset_tokens (user_id);

CREATE TABLE IF NOT EXISTS auth_security_events (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  user_id VARCHAR,
  normalized_email TEXT,
  ip_address TEXT,
  user_agent TEXT,
  outcome TEXT NOT NULL,
  reason_code TEXT,
  request_id TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS auth_security_events_created_idx
  ON auth_security_events (created_at);

CREATE INDEX IF NOT EXISTS auth_security_events_type_idx
  ON auth_security_events (event_type);
