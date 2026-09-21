CREATE UNIQUE INDEX IF NOT EXISTS seo_actions_reserved_idempotency_uidx ON seo_actions(property_id,idempotency_key)
WHERE status IN ('detected','researching','proposed','approved','revision_required');
DROP INDEX IF EXISTS seo_actions_open_idempotency_uidx;
