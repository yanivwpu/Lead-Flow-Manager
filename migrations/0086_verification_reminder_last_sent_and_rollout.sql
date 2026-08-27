-- Latest successfully accepted verification email (signup, manual resend,
-- Change Email, automatic reminder, guarded legacy recovery).
-- Automatic reminders wait 24 hours from this timestamp; null falls back
-- to users.created_at. Do not backfill existing rows.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS verification_email_last_sent_at timestamp;

-- Durable rollout boundary for automatic verification reminders.
-- INSERT uses NOW() once; ON CONFLICT DO NOTHING so later processes do not
-- move the boundary to their own startup time.
CREATE TABLE IF NOT EXISTS app_feature_rollouts (
  feature_key text PRIMARY KEY,
  active_after timestamp NOT NULL,
  created_at timestamp DEFAULT NOW()
);

INSERT INTO app_feature_rollouts (feature_key, active_after)
VALUES ('verification_reminder', NOW())
ON CONFLICT (feature_key) DO NOTHING;
