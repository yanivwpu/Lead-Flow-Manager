-- Dedicated flag for day-10 activation email (replaces legacy checkin_email_sent for new sequence).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "activation_email_day10_sent" boolean DEFAULT false;

-- Users who already received the old trial check-in email should not get day 10 again.
UPDATE "users"
SET "activation_email_day10_sent" = true
WHERE "checkin_email_sent" = true
  AND ("activation_email_day10_sent" IS NULL OR "activation_email_day10_sent" = false);
