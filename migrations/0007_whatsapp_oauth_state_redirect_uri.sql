-- Add redirect_uri to WhatsApp Embedded Signup state table.
-- Required to ensure code exchange uses byte-for-byte identical redirect URI.
ALTER TABLE "whatsapp_oauth_states" ADD COLUMN IF NOT EXISTS "redirect_uri" text;

