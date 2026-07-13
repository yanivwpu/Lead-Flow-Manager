-- Phase 1B: Gmail push watch metadata + mailbox sync coalescing locks
-- Watch status is separate from credential syncStatus.

ALTER TABLE email_mailboxes
  ADD COLUMN IF NOT EXISTS gmail_watch_history_id text,
  ADD COLUMN IF NOT EXISTS gmail_watch_expiration timestamp,
  ADD COLUMN IF NOT EXISTS gmail_watch_status text NOT NULL DEFAULT 'not_configured',
  ADD COLUMN IF NOT EXISTS gmail_watch_last_registered_at timestamp,
  ADD COLUMN IF NOT EXISTS gmail_watch_last_notification_at timestamp,
  ADD COLUMN IF NOT EXISTS gmail_watch_last_error text,
  ADD COLUMN IF NOT EXISTS sync_pending boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sync_lock_until timestamp,
  ADD COLUMN IF NOT EXISTS sync_lock_owner text,
  ADD COLUMN IF NOT EXISTS observed_remote_history_id text;

CREATE INDEX IF NOT EXISTS email_mailboxes_gmail_watch_expiration_idx
  ON email_mailboxes (gmail_watch_expiration)
  WHERE provider = 'gmail';

CREATE INDEX IF NOT EXISTS email_mailboxes_gmail_email_norm_idx
  ON email_mailboxes (provider, lower(email_address));
