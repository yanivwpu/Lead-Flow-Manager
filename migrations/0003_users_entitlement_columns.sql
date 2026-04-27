-- Safe add: users entitlement columns (Option A) — idempotent for Neon / Railway
-- Maps to shared/schema.ts: billingPlan, planOverride, planOverrideEnabled

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "billing_plan" text DEFAULT 'free';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "plan_override" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "plan_override_enabled" boolean DEFAULT false;
