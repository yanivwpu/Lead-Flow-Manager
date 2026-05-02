-- App-wide Pro + AI Brain trial (14 days). Idempotent for Neon / Railway.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "trial_started_at" timestamp;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "trial_status" text DEFAULT 'none';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "trial_plan" text;

-- Backfill from existing trial_ends_at
UPDATE "users" SET
  "trial_started_at" = COALESCE("trial_started_at", "trial_ends_at" - interval '14 days')
WHERE "trial_ends_at" IS NOT NULL AND "trial_started_at" IS NULL;

UPDATE "users" SET "trial_plan" = 'pro_ai'
WHERE "trial_ends_at" IS NOT NULL AND ("trial_plan" IS NULL OR "trial_plan" = '');

UPDATE "users" SET "trial_status" = CASE
  WHEN "trial_ends_at" IS NULL THEN 'none'
  WHEN "trial_ends_at" > NOW() THEN 'active'
  ELSE 'expired'
END
WHERE "trial_ends_at" IS NOT NULL;

UPDATE "users" SET "trial_status" = 'none' WHERE "trial_status" IS NULL;
