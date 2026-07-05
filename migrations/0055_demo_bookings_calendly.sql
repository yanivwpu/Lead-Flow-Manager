-- Marketing demo bookings: Calendly sync fields
ALTER TABLE demo_bookings ALTER COLUMN scheduled_date DROP NOT NULL;

ALTER TABLE demo_bookings ADD COLUMN IF NOT EXISTS calendly_scheduled_event_uri text;
ALTER TABLE demo_bookings ADD COLUMN IF NOT EXISTS calendly_invitee_uri text;
ALTER TABLE demo_bookings ADD COLUMN IF NOT EXISTS meeting_link text;
ALTER TABLE demo_bookings ADD COLUMN IF NOT EXISTS calendly_payload jsonb;
ALTER TABLE demo_bookings ADD COLUMN IF NOT EXISTS calendly_confirmed_at timestamp;

CREATE INDEX IF NOT EXISTS demo_bookings_calendly_event_uri_idx
  ON demo_bookings (calendly_scheduled_event_uri)
  WHERE calendly_scheduled_event_uri IS NOT NULL;

CREATE INDEX IF NOT EXISTS demo_bookings_awaiting_schedule_email_idx
  ON demo_bookings (lower(trim(visitor_email)), status)
  WHERE status = 'awaiting_schedule';
