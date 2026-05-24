-- Phase 2 production hardening: additive indexes only (safe for Neon / production).
-- Does NOT drop, rename, or alter existing columns.
--
-- Apply manually:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/0029_additive_production_indexes.sql
--
BEGIN;

-- Inbox: contacts listed by user, sorted by recent activity
CREATE INDEX IF NOT EXISTS contacts_user_id_updated_at_idx
  ON contacts (user_id, updated_at DESC);

-- Inbox: conversations per contact + user-scoped inbox sort
CREATE INDEX IF NOT EXISTS conversations_contact_id_last_message_at_idx
  ON conversations (contact_id, last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS conversations_user_id_last_message_at_idx
  ON conversations (user_id, last_message_at DESC NULLS LAST);

-- Messages: thread load + timeline queries
CREATE INDEX IF NOT EXISTS messages_conversation_id_created_at_idx
  ON messages (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS messages_contact_id_created_at_idx
  ON messages (contact_id, created_at DESC);

CREATE INDEX IF NOT EXISTS messages_user_id_created_at_idx
  ON messages (user_id, created_at DESC);

-- Channel settings: per-user channel lookups (integrations page + outbound adapters)
CREATE INDEX IF NOT EXISTS channel_settings_user_id_channel_idx
  ON channel_settings (user_id, channel);

-- Integrations table: user-scoped integration lists
CREATE INDEX IF NOT EXISTS integrations_user_id_type_idx
  ON integrations (user_id, type);

CREATE INDEX IF NOT EXISTS integrations_user_id_is_active_idx
  ON integrations (user_id, is_active);

-- Activity timeline per contact
CREATE INDEX IF NOT EXISTS activity_events_contact_id_created_at_idx
  ON activity_events (contact_id, created_at DESC);

CREATE INDEX IF NOT EXISTS activity_events_user_id_created_at_idx
  ON activity_events (user_id, created_at DESC);

-- Campaign scheduler: active enrollments due for execution
CREATE INDEX IF NOT EXISTS campaign_enrollments_active_due_idx
  ON campaign_enrollments (next_run_at ASC)
  WHERE status = 'active' AND next_run_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS campaign_enrollments_contact_campaign_idx
  ON campaign_enrollments (user_id, contact_id, campaign_id, status);

-- Flow / automation job schedulers (0020 added no_reply + automation_timer; flow_jobs was missing)
CREATE INDEX IF NOT EXISTS flow_jobs_pending_run_at_idx
  ON flow_jobs (run_at ASC)
  WHERE status = 'pending';

-- Meta webhook user resolution by phone_number_id
CREATE INDEX IF NOT EXISTS users_meta_phone_number_id_idx
  ON users (meta_phone_number_id)
  WHERE meta_phone_number_id IS NOT NULL;

-- Shopify shop lookup for webhook routing
CREATE INDEX IF NOT EXISTS users_shopify_shop_idx
  ON users (shopify_shop)
  WHERE shopify_shop IS NOT NULL;

-- Contact channel identity lookups (WhatsApp / Instagram / Facebook inbound)
CREATE INDEX IF NOT EXISTS contacts_user_whatsapp_id_idx
  ON contacts (user_id, whatsapp_id)
  WHERE whatsapp_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS contacts_user_instagram_id_idx
  ON contacts (user_id, instagram_id)
  WHERE instagram_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS contacts_user_facebook_id_idx
  ON contacts (user_id, facebook_id)
  WHERE facebook_id IS NOT NULL;

COMMIT;
