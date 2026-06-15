CREATE TABLE IF NOT EXISTS calendly_canceled_event_tombstones (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scheduled_event_uri text NOT NULL,
  invitee_uri text,
  contact_id varchar,
  canceled_at timestamp DEFAULT NOW(),
  cancel_reason text,
  source text NOT NULL DEFAULT 'unknown'
);

CREATE UNIQUE INDEX IF NOT EXISTS calendly_canceled_tombstones_user_event_uri
  ON calendly_canceled_event_tombstones (user_id, scheduled_event_uri);

CREATE INDEX IF NOT EXISTS calendly_canceled_tombstones_user_invitee_uri
  ON calendly_canceled_event_tombstones (user_id, invitee_uri)
  WHERE invitee_uri IS NOT NULL;

-- Backfill tombstones from already-cancelled Calendly appointments.
INSERT INTO calendly_canceled_event_tombstones (user_id, scheduled_event_uri, invitee_uri, contact_id, cancel_reason, source)
SELECT
  user_id,
  calendly_scheduled_event_uri,
  calendly_invitee_uri,
  contact_id,
  'backfill_cancelled_appointment',
  'migration_0043'
FROM appointments
WHERE status IN ('cancelled', 'rescheduled')
  AND calendly_scheduled_event_uri IS NOT NULL
  AND TRIM(calendly_scheduled_event_uri) <> ''
ON CONFLICT DO NOTHING;
