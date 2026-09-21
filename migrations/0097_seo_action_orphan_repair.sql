-- Preserve but quarantine legacy actions that committed before version/event creation.
INSERT INTO seo_action_events (action_id, from_status, to_status, reason, safe_metadata)
SELECT a.id, a.status, 'failed', 'Initial recommendation version was not committed', '{"failureCategory":"ORPHANED_INITIAL_VERSION_REPAIRED"}'::jsonb
FROM seo_actions a
WHERE NOT EXISTS (SELECT 1 FROM seo_action_versions v WHERE v.action_id = a.id)
  AND NOT EXISTS (SELECT 1 FROM seo_action_events e WHERE e.action_id = a.id AND e.safe_metadata->>'failureCategory' = 'ORPHANED_INITIAL_VERSION_REPAIRED');
UPDATE seo_actions a SET status = 'failed', updated_at = NOW()
WHERE NOT EXISTS (SELECT 1 FROM seo_action_versions v WHERE v.action_id = a.id);
