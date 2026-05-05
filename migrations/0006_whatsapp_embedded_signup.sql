-- WhatsApp Embedded Signup / coexistence metadata + OAuth state CSRF table (Neon-safe).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "meta_connection_type" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "meta_token_expires_at" timestamp;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "meta_webhook_subscribed" boolean DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "meta_webhook_last_checked_at" timestamp;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "meta_integration_status" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "meta_last_error_code" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "meta_last_error_message" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "meta_display_phone_number" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "meta_verified_name" text;

-- Existing Meta Cloud API users (manual paste flow): label as legacy when column was null on migration.
UPDATE "users"
SET "meta_connection_type" = 'manual_legacy'
WHERE "meta_connected" = true AND "meta_connection_type" IS NULL;

CREATE TABLE IF NOT EXISTS "whatsapp_oauth_states" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "state_token" text NOT NULL UNIQUE,
  "flow" text NOT NULL,
  "redirect_uri" text,
  "created_at" timestamp DEFAULT now(),
  "expires_at" timestamp NOT NULL
);

CREATE INDEX IF NOT EXISTS "whatsapp_oauth_states_expires_idx" ON "whatsapp_oauth_states" ("expires_at");
