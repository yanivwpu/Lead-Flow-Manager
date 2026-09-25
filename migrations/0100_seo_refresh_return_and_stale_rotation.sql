ALTER TABLE seo_actions ADD COLUMN IF NOT EXISTS refresh_return_status text;
ALTER TABLE seo_actions ADD COLUMN IF NOT EXISTS stale_checked_at timestamp;
ALTER TABLE seo_actions ADD COLUMN IF NOT EXISTS stale_check_retry_at timestamp;
CREATE INDEX IF NOT EXISTS seo_actions_stale_rotation_idx ON seo_actions(property_id,status,stale_check_retry_at,stale_checked_at,id);
-- Recover only expired leased claims or conservative 30-minute-old pre-lease rows. Never touch active leases.
INSERT INTO seo_action_events (action_id,from_status,to_status,reason,safe_metadata)
SELECT a.id,'researching',CASE WHEN a.refresh_return_status IN ('proposed','revision_required','rejected') THEN a.refresh_return_status WHEN a.stale_at IS NOT NULL THEN 'revision_required' ELSE 'proposed' END,
 'Abandoned refresh claim recovered',jsonb_build_object('refreshRecovery',true,'failureCategory','ABANDONED_REFRESH_RECOVERED','claimTokenHash',CASE WHEN a.refresh_lease_token IS NULL THEN 'legacy' ELSE encode(digest(a.refresh_lease_token,'sha256'),'hex') END)
FROM seo_actions a WHERE a.status='researching' AND (
 (a.refresh_lease_token IS NOT NULL AND a.refresh_lease_expires_at<=NOW()) OR
 (a.refresh_lease_token IS NULL AND a.refresh_lease_expires_at IS NULL AND a.updated_at<=NOW()-INTERVAL '30 minutes'))
AND NOT EXISTS (SELECT 1 FROM seo_action_events e WHERE e.action_id=a.id AND e.safe_metadata->>'failureCategory'='ABANDONED_REFRESH_RECOVERED' AND e.safe_metadata->>'claimTokenHash'=CASE WHEN a.refresh_lease_token IS NULL THEN 'legacy' ELSE encode(digest(a.refresh_lease_token,'sha256'),'hex') END);
UPDATE seo_actions a SET status=CASE WHEN refresh_return_status IN ('proposed','revision_required','rejected') THEN refresh_return_status WHEN stale_at IS NOT NULL THEN 'revision_required' ELSE 'proposed' END,
 refresh_failure_category='ABANDONED_REFRESH_RECOVERED',refresh_lease_token=NULL,refresh_started_at=NULL,refresh_lease_expires_at=NULL,refresh_return_status=NULL,updated_at=NOW()
WHERE status='researching' AND ((refresh_lease_token IS NOT NULL AND refresh_lease_expires_at<=NOW()) OR
 (refresh_lease_token IS NULL AND refresh_lease_expires_at IS NULL AND updated_at<=NOW()-INTERVAL '30 minutes'));
