-- Store pending Meta token + WABA choices for Embedded Signup multi-WABA selection.
ALTER TABLE "whatsapp_oauth_states" ADD COLUMN IF NOT EXISTS "pending_access_token" text;
ALTER TABLE "whatsapp_oauth_states" ADD COLUMN IF NOT EXISTS "pending_waba_choices" jsonb;

