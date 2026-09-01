-- Short-lived encrypted GHL OAuth pending handoff (Marketplace install without a WhachatCRM session).
-- Tokens live only here (encrypted), never in ghl_marketplace_installs.raw_payload.

CREATE TABLE IF NOT EXISTS ghl_oauth_pending_handoffs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_token_hash TEXT NOT NULL,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMP,
  scope TEXT,
  user_type TEXT,
  company_id TEXT NOT NULL,
  location_id TEXT,
  app_id TEXT,
  version_id TEXT,
  ghl_user_id TEXT,
  marketplace_install_id VARCHAR REFERENCES ghl_marketplace_installs(id) ON DELETE SET NULL,
  expires_at TIMESTAMP NOT NULL,
  consumed_at TIMESTAMP,
  consumed_by_user_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ghl_oauth_pending_handoffs_claim_token_hash_uidx
  ON ghl_oauth_pending_handoffs (claim_token_hash);

CREATE INDEX IF NOT EXISTS ghl_oauth_pending_handoffs_expires_idx
  ON ghl_oauth_pending_handoffs (expires_at);

CREATE INDEX IF NOT EXISTS ghl_oauth_pending_handoffs_company_location_idx
  ON ghl_oauth_pending_handoffs (company_id, location_id);
