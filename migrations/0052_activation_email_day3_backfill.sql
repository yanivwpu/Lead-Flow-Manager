-- Users who already received the legacy trial check-in should not get day 3 retroactively.
UPDATE "users"
SET "activation_email_day3_sent" = true
WHERE "checkin_email_sent" = true
  AND ("activation_email_day3_sent" IS NULL OR "activation_email_day3_sent" = false);
