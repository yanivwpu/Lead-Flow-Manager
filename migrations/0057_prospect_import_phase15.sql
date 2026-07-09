-- Phase 1.5: prospect import batch metadata, undo, templates
ALTER TABLE prospect_import_jobs ADD COLUMN IF NOT EXISTS batch_name text;
ALTER TABLE prospect_import_jobs ADD COLUMN IF NOT EXISTS import_reason text;
ALTER TABLE prospect_import_jobs ADD COLUMN IF NOT EXISTS undo_status text NOT NULL DEFAULT 'none';
ALTER TABLE prospect_import_jobs ADD COLUMN IF NOT EXISTS undone_at timestamp;
ALTER TABLE prospect_import_jobs ADD COLUMN IF NOT EXISTS undone_by_user_id varchar REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS prospect_import_templates (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_name text NOT NULL,
  provider text NOT NULL DEFAULT 'gohighlevel',
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  default_internal_tag text,
  default_import_reason text,
  default_import_limit integer DEFAULT 100,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prospect_import_templates_user_idx
  ON prospect_import_templates (created_by_user_id, updated_at DESC);
