-- Allow unassigned demo bookings after decline when no replacement salesperson exists
ALTER TABLE demo_bookings ALTER COLUMN salesperson_id DROP NOT NULL;
