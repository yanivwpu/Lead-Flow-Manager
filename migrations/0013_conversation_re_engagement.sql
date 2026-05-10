-- Per-conversation re-engagement metadata (WhatsApp template follow-up; future scheduler fields).
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS re_engagement jsonb NOT NULL DEFAULT '{}'::jsonb;
