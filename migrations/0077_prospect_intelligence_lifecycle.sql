-- Prospect AI record lifecycle (archive / trash / soft-delete).
-- Lives on prospect_intelligence only — never CRM contacts.
-- Additive / idempotent.

ALTER TABLE prospect_intelligence
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'active';

ALTER TABLE prospect_intelligence
  ADD COLUMN IF NOT EXISTS archived_at timestamp;

ALTER TABLE prospect_intelligence
  ADD COLUMN IF NOT EXISTS archived_by_user_id varchar REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE prospect_intelligence
  ADD COLUMN IF NOT EXISTS archive_reason text;

ALTER TABLE prospect_intelligence
  ADD COLUMN IF NOT EXISTS archive_note text;

ALTER TABLE prospect_intelligence
  ADD COLUMN IF NOT EXISTS trashed_at timestamp;

ALTER TABLE prospect_intelligence
  ADD COLUMN IF NOT EXISTS trashed_by_user_id varchar REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE prospect_intelligence
  ADD COLUMN IF NOT EXISTS deleted_at timestamp;

ALTER TABLE prospect_intelligence
  ADD COLUMN IF NOT EXISTS deleted_by_user_id varchar REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE prospect_intelligence
  ADD COLUMN IF NOT EXISTS restored_at timestamp;

CREATE INDEX IF NOT EXISTS prospect_intelligence_lifecycle_status_idx
  ON prospect_intelligence (lifecycle_status);

CREATE INDEX IF NOT EXISTS prospect_intelligence_archived_at_idx
  ON prospect_intelligence (archived_at)
  WHERE archived_at IS NOT NULL;
