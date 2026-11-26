-- Workspace-shared dismissal of a single inbound message recommendation.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS dismissed_reply_message_at text;
