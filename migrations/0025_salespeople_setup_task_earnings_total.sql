-- Track Growth Engine setup task payouts separately for Sales Portal earnings breakdown.

ALTER TABLE salespeople ADD COLUMN IF NOT EXISTS setup_task_earnings_total NUMERIC(10, 2) NOT NULL DEFAULT 0;
