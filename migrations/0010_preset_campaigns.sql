-- Saved preset automation campaign instances (blueprints → user-owned campaigns).
CREATE TABLE IF NOT EXISTS "preset_campaigns" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "source_preset_id" text NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "channel" text NOT NULL DEFAULT 'whatsapp',
  "language" text DEFAULT 'en',
  "category" text,
  "industry" text,
  "messages" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "delays" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "placeholders" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "placeholder_defaults" jsonb DEFAULT '{}'::jsonb,
  "ai_enabled" boolean DEFAULT false,
  "audience_config" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "preset_campaigns_user_id_idx" ON "preset_campaigns" ("user_id");
