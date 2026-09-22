ALTER TABLE seo_actions ADD COLUMN IF NOT EXISTS refresh_lease_token text;
ALTER TABLE seo_actions ADD COLUMN IF NOT EXISTS refresh_started_at timestamp;
ALTER TABLE seo_actions ADD COLUMN IF NOT EXISTS refresh_lease_expires_at timestamp;
ALTER TABLE seo_actions ADD COLUMN IF NOT EXISTS refresh_failure_category text;
CREATE INDEX IF NOT EXISTS seo_actions_refresh_lease_idx ON seo_actions(property_id, status, refresh_lease_expires_at);
-- Recovery is intentionally deferred to 0100, which distinguishes active, expired, and conservatively abandoned legacy claims.
