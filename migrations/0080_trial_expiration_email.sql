-- Send-once marker for the Pro + AI Brain trial-expiration email.
-- Timestamp (not a boolean) so failed Resend sends remain retryable.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS trial_expiration_email_sent_at timestamp;

-- Do not blast accounts whose trial already ended before this feature shipped.
UPDATE users
SET trial_expiration_email_sent_at = COALESCE(trial_ends_at, NOW())
WHERE trial_expiration_email_sent_at IS NULL
  AND trial_ends_at IS NOT NULL
  AND trial_ends_at <= NOW();
