-- Per-salesperson fixed task payout (future: GE setup / demo task completion credits).
-- Role rename: demo -> sales (sales = demo bookings queue; setup = GE concierge; both = both).

ALTER TABLE salespeople ADD COLUMN IF NOT EXISTS task_payout_amount NUMERIC(10, 2);

UPDATE salespeople SET role = 'sales' WHERE role = 'demo';

ALTER TABLE salespeople ALTER COLUMN role SET DEFAULT 'sales';
