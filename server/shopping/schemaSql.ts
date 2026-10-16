export const SHOPPING_SCHEMA_SQL = `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS shopping_state jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS shopping_assistant jsonb NOT NULL DEFAULT '{}'::jsonb;`;
