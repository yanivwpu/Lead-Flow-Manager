ALTER TABLE seo_actions ADD COLUMN IF NOT EXISTS refresh_lease_token text;
ALTER TABLE seo_actions ADD COLUMN IF NOT EXISTS refresh_started_at timestamp;
ALTER TABLE seo_actions ADD COLUMN IF NOT EXISTS refresh_lease_expires_at timestamp;
ALTER TABLE seo_actions ADD COLUMN IF NOT EXISTS refresh_failure_category text;
CREATE INDEX IF NOT EXISTS seo_actions_refresh_lease_idx ON seo_actions(property_id, status, refresh_lease_expires_at);
-- Pre-lease deployments could strand researching actions. Restore them once, preserving history.
INSERT INTO seo_action_events (action_id, from_status, to_status, reason, safe_metadata)
SELECT a.id, 'researching', 'proposed', 'Interrupted refresh recovered during lease migration', '{"refreshRecovery":true,"failureCategory":"LEGACY_REFRESH_RECOVERED"}'::jsonb
FROM seo_actions a WHERE a.status='researching'
  AND NOT EXISTS (SELECT 1 FROM seo_action_events e WHERE e.action_id=a.id AND e.safe_metadata->>'failureCategory'='LEGACY_REFRESH_RECOVERED');
UPDATE seo_actions SET status='proposed', refresh_failure_category='LEGACY_REFRESH_RECOVERED', updated_at=NOW()
WHERE status='researching';
