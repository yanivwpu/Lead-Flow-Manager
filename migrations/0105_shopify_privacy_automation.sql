-- Additive, repeat-safe; legacy tasks remain pending until evidence covers all checks.
ALTER TABLE shopify_privacy_erasure_tasks ADD COLUMN IF NOT EXISTS request_kind text NOT NULL DEFAULT 'store_erasure';
ALTER TABLE shopify_privacy_erasure_tasks ADD COLUMN IF NOT EXISTS dedupe_key text;
ALTER TABLE shopify_privacy_erasure_tasks ADD COLUMN IF NOT EXISTS deadline_at timestamp;
UPDATE shopify_privacy_erasure_tasks SET deadline_at = requested_at + interval '30 days' WHERE deadline_at IS NULL;
ALTER TABLE shopify_privacy_erasure_tasks ALTER COLUMN deadline_at SET DEFAULT (NOW() + interval '30 days');
ALTER TABLE shopify_privacy_erasure_tasks ALTER COLUMN deadline_at SET NOT NULL;
ALTER TABLE shopify_privacy_erasure_tasks ADD COLUMN IF NOT EXISTS next_attempt_at timestamp NOT NULL DEFAULT NOW();
ALTER TABLE shopify_privacy_erasure_tasks ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
ALTER TABLE shopify_privacy_erasure_tasks ADD COLUMN IF NOT EXISTS lease_token text;
ALTER TABLE shopify_privacy_erasure_tasks ADD COLUMN IF NOT EXISTS lease_expires_at timestamp;
ALTER TABLE shopify_privacy_erasure_tasks ADD COLUMN IF NOT EXISTS error_code text;
ALTER TABLE shopify_privacy_erasure_tasks ADD COLUMN IF NOT EXISTS checks jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE shopify_privacy_erasure_tasks ADD COLUMN IF NOT EXISTS required_checks jsonb NOT NULL DEFAULT '["railway_logs","mail_processor","archives","backups","exports","local_review"]'::jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS shopify_privacy_erasure_dedupe ON shopify_privacy_erasure_tasks(dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS shopify_privacy_erasure_due ON shopify_privacy_erasure_tasks(next_attempt_at) WHERE completed_at IS NULL;
CREATE TABLE IF NOT EXISTS shopify_privacy_alerts (
 id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
 task_id varchar NOT NULL REFERENCES shopify_privacy_erasure_tasks(id) ON DELETE CASCADE,
 reason text NOT NULL, status text NOT NULL, action_code text NOT NULL,
 created_at timestamp NOT NULL DEFAULT NOW(), delivered_at timestamp,
 attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamp NOT NULL DEFAULT NOW(),
 lease_token text, lease_expires_at timestamp,
 UNIQUE(task_id, reason)
);
-- Suppression hashes are scoped to the shop and retained separately from operation status.
CREATE TABLE IF NOT EXISTS shopify_privacy_customer_locks (
 identity_hash text PRIMARY KEY, created_at timestamp NOT NULL DEFAULT NOW()
);
-- Restricted support payloads only for access/ambiguous requests. Never exposed by Admin status.
CREATE TABLE IF NOT EXISTS shopify_privacy_request_payloads (
 task_id varchar PRIMARY KEY REFERENCES shopify_privacy_erasure_tasks(id) ON DELETE CASCADE,
 encrypted_payload text NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS shopify_privacy_alert_dedupe ON shopify_privacy_alerts(task_id, reason);
