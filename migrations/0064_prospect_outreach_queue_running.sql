-- Fail-closed queue arm: Start must explicitly set queue_running=true before sends.
ALTER TABLE prospect_outreach_settings
  ADD COLUMN IF NOT EXISTS queue_running boolean NOT NULL DEFAULT false;
