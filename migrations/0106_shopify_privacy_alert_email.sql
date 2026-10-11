BEGIN;
SELECT pg_advisory_xact_lock(1060107);
-- One active occurrence per issue; resolved occurrences and acceptance records are retained.
ALTER TABLE shopify_privacy_alerts ADD COLUMN IF NOT EXISTS resolved_at timestamp;
ALTER TABLE shopify_privacy_alerts ADD COLUMN IF NOT EXISTS email_payload jsonb;
ALTER TABLE shopify_privacy_alerts ADD COLUMN IF NOT EXISTS email_started_at timestamp;
ALTER TABLE shopify_privacy_alerts ADD COLUMN IF NOT EXISTS email_uncertain boolean NOT NULL DEFAULT false;
ALTER TABLE shopify_privacy_alerts ADD COLUMN IF NOT EXISTS email_accepted_at timestamp;
ALTER TABLE shopify_privacy_alerts ADD COLUMN IF NOT EXISTS provider_message_id text;
ALTER TABLE shopify_privacy_alerts ADD COLUMN IF NOT EXISTS email_reconciliation_required boolean NOT NULL DEFAULT false;
ALTER TABLE shopify_privacy_alerts DROP CONSTRAINT IF EXISTS shopify_privacy_alerts_task_id_reason_key;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname=current_schema() AND indexname='shopify_privacy_alert_dedupe'
   AND indexdef NOT LIKE '%WHERE (resolved_at IS NULL)%') THEN
   DROP INDEX shopify_privacy_alert_dedupe;
 END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS shopify_privacy_alert_dedupe ON shopify_privacy_alerts(task_id, reason) WHERE resolved_at IS NULL;
CREATE OR REPLACE VIEW shopify_privacy_current_issues AS
 SELECT t.id task_id, reason, t.status, action_code FROM shopify_privacy_erasure_tasks t CROSS JOIN LATERAL (
   SELECT 'permanent_failure' reason, COALESCE(error_code,'provider_permanent') action_code WHERE status='permanent_failure'
   UNION ALL SELECT 'configuration', COALESCE(error_code,'missing_configuration') WHERE status='blocked' AND request_kind<>'access_request'
   UNION ALL SELECT 'access_request','access_request' WHERE request_kind='access_request'
   UNION ALL SELECT 'approaching_deadline','approaching_deadline' WHERE deadline_at>NOW() AND deadline_at<=NOW()+interval '3 days'
   UNION ALL SELECT 'overdue','overdue' WHERE deadline_at<=NOW()
 ) exceptions WHERE t.completed_at IS NULL;

COMMIT;
