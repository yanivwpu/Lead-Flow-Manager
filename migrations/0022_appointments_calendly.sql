-- Link Calendly-confirmed bookings to CRM appointments + inbox context.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS conversation_id varchar;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS source varchar NOT NULL DEFAULT 'manual';
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS calendly_scheduled_event_uri text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS calendly_invitee_uri text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS appointment_end timestamptz;

COMMENT ON COLUMN appointments.source IS 'manual | calendly';
COMMENT ON COLUMN appointments.calendly_scheduled_event_uri IS 'Calendly scheduled event URI — dedupe key for webhook retries';

CREATE UNIQUE INDEX IF NOT EXISTS appointments_user_calendly_scheduled_uidx
  ON appointments (user_id, calendly_scheduled_event_uri)
  WHERE calendly_scheduled_event_uri IS NOT NULL;
