-- Website form email classification + Reply-To display name (Unified Inbox)
ALTER TABLE email_message_details
  ADD COLUMN IF NOT EXISTS reply_to_name text;

ALTER TABLE email_message_details
  ADD COLUMN IF NOT EXISTS source_type text;

ALTER TABLE email_message_details
  ADD COLUMN IF NOT EXISTS source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS email_message_details_source_type_idx
  ON email_message_details (source_type)
  WHERE source_type IS NOT NULL;
