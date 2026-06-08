-- Demo decline tracking + ensure acceptance columns exist (safe re-apply)
ALTER TABLE demo_bookings ADD COLUMN IF NOT EXISTS assigned_at timestamp;
ALTER TABLE demo_bookings ADD COLUMN IF NOT EXISTS accepted_at timestamp;
ALTER TABLE demo_bookings ADD COLUMN IF NOT EXISTS decline_reason text;
ALTER TABLE demo_bookings ADD COLUMN IF NOT EXISTS declined_by_salesperson_id varchar;
ALTER TABLE demo_bookings ADD COLUMN IF NOT EXISTS declined_at timestamp;

UPDATE demo_bookings SET status = 'pending_acceptance' WHERE status = 'pending';

UPDATE demo_bookings
SET assigned_at = COALESCE(assigned_at, created_at)
WHERE status IN ('pending_acceptance', 'accepted');
