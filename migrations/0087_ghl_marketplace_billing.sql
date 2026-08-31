-- GHL Marketplace billing / lifecycle columns + webhook idempotency (no integration_id required).
ALTER TABLE ghl_marketplace_installs ADD COLUMN IF NOT EXISTS app_id text;
ALTER TABLE ghl_marketplace_installs ADD COLUMN IF NOT EXISTS marketplace_plan_id text;
ALTER TABLE ghl_marketplace_installs ADD COLUMN IF NOT EXISTS payment_status text;
ALTER TABLE ghl_marketplace_installs ADD COLUMN IF NOT EXISTS ghl_user_id text;
ALTER TABLE ghl_marketplace_installs ADD COLUMN IF NOT EXISTS previous_version_id text;
ALTER TABLE ghl_marketplace_installs ADD COLUMN IF NOT EXISTS version_id text;
ALTER TABLE ghl_marketplace_installs ADD COLUMN IF NOT EXISTS ghl_trial_on_trial boolean;
ALTER TABLE ghl_marketplace_installs ADD COLUMN IF NOT EXISTS ghl_trial_duration integer;
ALTER TABLE ghl_marketplace_installs ADD COLUMN IF NOT EXISTS ghl_trial_start_date timestamp;
ALTER TABLE ghl_marketplace_installs ADD COLUMN IF NOT EXISTS last_webhook_id text;
ALTER TABLE ghl_marketplace_installs ADD COLUMN IF NOT EXISTS last_event_occurred_at timestamp;
ALTER TABLE ghl_marketplace_installs ADD COLUMN IF NOT EXISTS last_event_type text;
ALTER TABLE ghl_marketplace_installs ADD COLUMN IF NOT EXISTS unknown_plan_warning text;

CREATE TABLE IF NOT EXISTS ghl_marketplace_webhook_dedup (
  webhook_id text PRIMARY KEY,
  event_type text NOT NULL,
  company_id text,
  location_id text,
  occurred_at timestamp,
  processed_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ghl_marketplace_installs_marketplace_plan_id_idx
  ON ghl_marketplace_installs (marketplace_plan_id);

CREATE INDEX IF NOT EXISTS ghl_marketplace_installs_last_webhook_id_idx
  ON ghl_marketplace_installs (last_webhook_id);
