-- Phase 1: bind Embedded Signup architecture (v2|v4) to OAuth CSRF state.
ALTER TABLE "whatsapp_oauth_states"
  ADD COLUMN IF NOT EXISTS "architecture_version" text NOT NULL DEFAULT 'v2';
