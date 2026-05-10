-- Safe additive migration: preset campaign execution (enrollments + step audit).
-- Does NOT modify, rename, or drop `user_sessions` or any other existing table.
--
-- Apply in production (recommended):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/0011_campaign_execution_tables.sql
-- or paste into Neon / Cloud SQL “SQL Editor” and run as a single transaction.
--
BEGIN;

CREATE TABLE IF NOT EXISTS "campaign_enrollments" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "campaign_id" varchar NOT NULL REFERENCES "preset_campaigns"("id") ON DELETE CASCADE,
  "contact_id" varchar NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE,
  "conversation_id" varchar REFERENCES "conversations"("id") ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'active',
  "current_step_index" integer NOT NULL DEFAULT 0,
  "next_run_at" timestamp,
  "last_run_at" timestamp,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "campaign_step_events" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "enrollment_id" varchar NOT NULL REFERENCES "campaign_enrollments"("id") ON DELETE CASCADE,
  "campaign_id" varchar NOT NULL REFERENCES "preset_campaigns"("id") ON DELETE CASCADE,
  "contact_id" varchar NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE,
  "step_index" integer NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "scheduled_for" timestamp,
  "sent_at" timestamp,
  "error_message" text,
  "provider_message_id" text,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "campaign_enrollments_user_id_idx" ON "campaign_enrollments" ("user_id");
CREATE INDEX IF NOT EXISTS "campaign_enrollments_campaign_id_idx" ON "campaign_enrollments" ("campaign_id");
CREATE INDEX IF NOT EXISTS "campaign_enrollments_next_run_at_idx" ON "campaign_enrollments" ("next_run_at");

CREATE INDEX IF NOT EXISTS "campaign_step_events_enrollment_id_idx" ON "campaign_step_events" ("enrollment_id");
CREATE INDEX IF NOT EXISTS "campaign_step_events_campaign_id_idx" ON "campaign_step_events" ("campaign_id");

COMMIT;
