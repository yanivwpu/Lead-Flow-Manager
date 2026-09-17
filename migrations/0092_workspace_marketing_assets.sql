-- Approved Marketing Materials library (Website Chat AI send, tenant-owned).
-- Soft-delete keeps historical conversation media intact after an asset is removed.
--
-- Idempotent: CREATE TABLE/INDEX IF NOT EXISTS. Safe to re-run on an existing Neon DB.
-- No DROP/ALTER/TRUNCATE. Existing message media columns are untouched.
--
-- Rollback: do not DROP this table in production. Disable or soft-delete rows instead.
-- DROP TABLE workspace_marketing_assets would remove library metadata only; conversation
-- messages keep media_url / media_storage_key, so visitor history continues to work.
-- R2 objects are intentionally retained so historical transcripts keep loading.

CREATE TABLE IF NOT EXISTS workspace_marketing_assets (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  description text,
  language text NOT NULL DEFAULT 'all',
  topics jsonb NOT NULL DEFAULT '[]'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  kind text NOT NULL,
  mime_type text NOT NULL,
  original_filename text NOT NULL,
  media_url text NOT NULL,
  media_storage_key text NOT NULL,
  media_size integer NOT NULL DEFAULT 0,
  deleted_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspace_marketing_assets_user_enabled_idx
  ON workspace_marketing_assets (user_id, enabled, deleted_at);

CREATE INDEX IF NOT EXISTS workspace_marketing_assets_user_created_idx
  ON workspace_marketing_assets (user_id, created_at);
