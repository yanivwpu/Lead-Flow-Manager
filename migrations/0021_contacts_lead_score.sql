-- Cumulative CRM lead score (0–100); updated by W2 / automations; optional for legacy rows.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_score integer;

COMMENT ON COLUMN contacts.lead_score IS 'Numeric lead score 0-100; Realtor W2 engine increments; UI/automations may read';
