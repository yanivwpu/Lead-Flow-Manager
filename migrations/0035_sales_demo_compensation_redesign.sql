-- Demo acceptance workflow + conversion payout tracking
ALTER TABLE demo_bookings ADD COLUMN IF NOT EXISTS assigned_at timestamp;
ALTER TABLE demo_bookings ADD COLUMN IF NOT EXISTS accepted_at timestamp;
ALTER TABLE demo_bookings ADD COLUMN IF NOT EXISTS decline_reason text;

ALTER TABLE sales_conversions ADD COLUMN IF NOT EXISTS conversion_date timestamp;
ALTER TABLE sales_conversions ADD COLUMN IF NOT EXISTS demo_date timestamp;
ALTER TABLE sales_conversions ADD COLUMN IF NOT EXISTS payout_eligible boolean NOT NULL DEFAULT true;
ALTER TABLE sales_conversions ADD COLUMN IF NOT EXISTS eligibility_notes text;

-- Migrate legacy pending demos to pending_acceptance
UPDATE demo_bookings SET status = 'pending_acceptance' WHERE status = 'pending';

-- Backfill assignment timestamp for open assignments
UPDATE demo_bookings
SET assigned_at = COALESCE(assigned_at, created_at)
WHERE status IN ('pending_acceptance', 'accepted');
