-- Opaque public widget / ingress IDs, webchat page context, AI control, job tenancy.
-- Deploy-safe: ADD COLUMN IF NOT EXISTS + deterministic backfill (does not encode users.id).

ALTER TABLE users ADD COLUMN IF NOT EXISTS widget_public_id varchar;
ALTER TABLE users ADD COLUMN IF NOT EXISTS widget_public_id_rotated_at timestamp;
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_webhook_public_id varchar;
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_webhook_secret text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tiktok_lead_public_id varchar;

UPDATE users
SET widget_public_id = 'wgt_' || replace(gen_random_uuid()::text, '-', '') || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)
WHERE widget_public_id IS NULL OR widget_public_id = '';

UPDATE users
SET telegram_webhook_public_id = 'tgk_' || replace(gen_random_uuid()::text, '-', '') || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)
WHERE telegram_webhook_public_id IS NULL OR telegram_webhook_public_id = '';

UPDATE users
SET telegram_webhook_secret = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
WHERE telegram_webhook_secret IS NULL OR telegram_webhook_secret = '';

UPDATE users
SET tiktok_lead_public_id = 'ttk_' || replace(gen_random_uuid()::text, '-', '') || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)
WHERE tiktok_lead_public_id IS NULL OR tiktok_lead_public_id = '';

CREATE UNIQUE INDEX IF NOT EXISTS users_widget_public_id_uidx
  ON users (widget_public_id)
  WHERE widget_public_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_telegram_webhook_public_id_uidx
  ON users (telegram_webhook_public_id)
  WHERE telegram_webhook_public_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_tiktok_lead_public_id_uidx
  ON users (tiktok_lead_public_id)
  WHERE tiktok_lead_public_id IS NOT NULL;

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS webchat_context jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS ai_control jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS generated_by text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS generation_meta jsonb;

ALTER TABLE flow_jobs ADD COLUMN IF NOT EXISTS user_id varchar REFERENCES users(id) ON DELETE CASCADE;

UPDATE flow_jobs
SET user_id = COALESCE(
  user_id,
  NULLIF(payload->>'userId', ''),
  (SELECT cf.user_id FROM chatbot_flows cf WHERE cf.id = flow_jobs.flow_id LIMIT 1)
)
WHERE user_id IS NULL;

CREATE INDEX IF NOT EXISTS flow_jobs_user_id_idx ON flow_jobs (user_id);
