-- Send-once marker for the 24-hour unverified public-signup reminder.
-- Timestamp (not a boolean) so failed Resend sends remain retryable.
-- Do not stamp existing unverified users: they remain eligible for the
-- guarded backfill and for the hourly job after 24 hours.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS verification_reminder_sent_at timestamp;
