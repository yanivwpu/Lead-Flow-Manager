-- Onboarding activation email sequence (Meta Embedded Signup era).
-- Day 3 email tracking. Day 10 uses activation_email_day10_sent (see 0051).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "activation_email_day3_sent" boolean DEFAULT false;
