-- Prospect AI Campaign Outreach Instructions + per-prospect email subject.
-- Additive / non-destructive: existing rows stay valid.

ALTER TABLE prospect_outreach_settings
  ADD COLUMN IF NOT EXISTS outreach_instructions jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE prospect_intelligence
  ADD COLUMN IF NOT EXISTS suggested_outreach_subject text;
