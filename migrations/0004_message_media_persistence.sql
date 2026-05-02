-- Inbound media persistence metadata (Cloudflare R2 + provider provenance)
-- Safe add for Neon / Railway

ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "provider_media_url" text;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "provider_media_id" text;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "media_mime_type" text;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "media_size" integer;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "media_storage_key" text;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "media_stored_at" timestamp;
