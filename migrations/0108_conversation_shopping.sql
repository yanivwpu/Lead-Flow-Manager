-- Lightweight state on existing records. No contacts, catalog copies or message senders.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS shopping_state jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS shopping_assistant jsonb NOT NULL DEFAULT '{}'::jsonb;
