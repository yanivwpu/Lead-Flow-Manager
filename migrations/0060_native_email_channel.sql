-- Phase 1A: Native Email Channel (Gmail-first)
-- One Gmail mailbox → sync → Unified Inbox → send/reply

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS subject text;

CREATE TABLE IF NOT EXISTS email_mailboxes (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connected_by_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'gmail',
  email_address text NOT NULL,
  display_name text,
  provider_account_id text,
  access_token_encrypted text NOT NULL,
  refresh_token_encrypted text,
  token_expires_at timestamp,
  scopes text,
  sync_cursor text,
  last_sync_at timestamp,
  sync_status text NOT NULL DEFAULT 'disconnected',
  sync_error text,
  sync_progress_current integer DEFAULT 0,
  sync_progress_total integer DEFAULT 0,
  webhook_subscription_id text,
  webhook_expires_at timestamp,
  is_primary boolean NOT NULL DEFAULT true,
  visibility text NOT NULL DEFAULT 'workspace',
  signature_html text,
  sync_from_date timestamp,
  initial_sync_mode text NOT NULL DEFAULT 'last_30_days',
  messages_sent_today integer DEFAULT 0,
  messages_sent_hour integer DEFAULT 0,
  send_count_day_key text,
  send_count_hour_key text,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS email_mailboxes_workspace_provider_email_uq
  ON email_mailboxes (workspace_user_id, provider, lower(email_address));

CREATE INDEX IF NOT EXISTS email_mailboxes_workspace_status_idx
  ON email_mailboxes (workspace_user_id, sync_status);

CREATE TABLE IF NOT EXISTS email_message_details (
  message_id varchar PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
  subject text,
  html_body text,
  text_body text,
  from_address text,
  to_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  cc_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  bcc_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  reply_to_address text,
  rfc_message_id text,
  in_reply_to text,
  references_header jsonb NOT NULL DEFAULT '[]'::jsonb,
  provider_thread_id text,
  snippet text,
  has_attachments boolean NOT NULL DEFAULT false,
  attachment_metadata jsonb NOT NULL DEFAULT '[]'::jsonb,
  selected_headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_message_details_thread_idx
  ON email_message_details (provider_thread_id);

CREATE UNIQUE INDEX IF NOT EXISTS email_message_details_rfc_message_id_uq
  ON email_message_details (rfc_message_id)
  WHERE rfc_message_id IS NOT NULL AND trim(rfc_message_id) <> '';

-- Email thread uniqueness: one conversation per mailbox + Gmail threadId
CREATE UNIQUE INDEX IF NOT EXISTS conversations_email_mailbox_thread_uq
  ON conversations (user_id, channel_account_id, external_thread_id)
  WHERE channel = 'email'
    AND channel_account_id IS NOT NULL
    AND external_thread_id IS NOT NULL;

ALTER TABLE messages ADD COLUMN IF NOT EXISTS sent_by_user_id varchar REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS email_oauth_states (
  state text PRIMARY KEY,
  workspace_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connected_by_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_verifier text,
  redirect_uri text,
  created_at timestamp DEFAULT now(),
  expires_at timestamp NOT NULL
);

CREATE INDEX IF NOT EXISTS email_oauth_states_expires_idx ON email_oauth_states (expires_at);
