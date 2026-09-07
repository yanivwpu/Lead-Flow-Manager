-- Dedicated immutable Website Chat visitor identity.
-- Canonical contacts.phone is the real submitted phone after identification.
-- Deploy-safe: ADD COLUMN IF NOT EXISTS + idempotent backfill + partial indexes.
-- Lookups are tenant-scoped: (user_id, webchat_id). The same visitor UUID may exist in another tenant.

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS webchat_id text;

COMMENT ON COLUMN contacts.webchat_id IS
  'Immutable Website Chat visitor UUID. Lookups use (user_id, webchat_id), never canonical phone.';

UPDATE contacts
SET webchat_id = NULLIF(custom_fields->>'webchatVisitorId', '')
WHERE (webchat_id IS NULL OR webchat_id = '')
  AND custom_fields->>'webchatVisitorId' IS NOT NULL
  AND custom_fields->>'webchatVisitorId' <> '';

UPDATE contacts
SET webchat_id = phone
WHERE (webchat_id IS NULL OR webchat_id = '')
  AND source = 'webchat'
  AND phone IS NOT NULL
  AND phone <> ''
  AND (
    phone ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR phone LIKE 'visitor_%'
    OR phone LIKE 'wchat_%'
    OR phone LIKE 'agent_page_%'
  );

UPDATE contacts
SET custom_fields = jsonb_set(
  COALESCE(custom_fields, '{}'::jsonb),
  '{webchatVisitorId}',
  to_jsonb(webchat_id),
  true
)
WHERE webchat_id IS NOT NULL
  AND webchat_id <> ''
  AND COALESCE(custom_fields->>'webchatVisitorId', '') = '';

CREATE UNIQUE INDEX IF NOT EXISTS contacts_user_id_webchat_id_uidx
  ON contacts (user_id, webchat_id)
  WHERE webchat_id IS NOT NULL AND webchat_id <> '';

CREATE INDEX IF NOT EXISTS contacts_user_id_webchat_visitor_jsonb_idx
  ON contacts (user_id, (custom_fields->>'webchatVisitorId'))
  WHERE custom_fields->>'webchatVisitorId' IS NOT NULL
    AND custom_fields->>'webchatVisitorId' <> '';

CREATE INDEX IF NOT EXISTS contacts_user_id_webchat_visitor_source_idx
  ON contacts (user_id, (source_details->>'webchatVisitorId'))
  WHERE source_details->>'webchatVisitorId' IS NOT NULL
    AND source_details->>'webchatVisitorId' <> '';
