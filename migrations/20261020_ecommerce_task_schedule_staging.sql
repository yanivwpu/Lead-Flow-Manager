-- Optional, staging-only schedules for existing Shopify internal support tasks.
-- Does not modify existing order event, customer, follow-up or task rows.
-- In-app due reminders only. No notification dispatch or email/WhatsApp sender.
CREATE TABLE IF NOT EXISTS ecommerce_growth_order_task_schedule (
  task_id BIGINT PRIMARY KEY REFERENCES ecommerce_growth_order_support_tasks(id) ON DELETE CASCADE,
  account_id VARCHAR(128) NOT NULL,
  shop VARCHAR(255) NOT NULL,
  assignee_user_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  due_at TIMESTAMPTZ,
  reminder_minutes INTEGER CHECK (reminder_minutes IN (0, 15, 60, 1440)),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (due_at IS NOT NULL OR reminder_minutes IS NULL)
);
CREATE INDEX IF NOT EXISTS ecommerce_growth_order_task_schedule_due_idx
  ON ecommerce_growth_order_task_schedule (account_id, shop, due_at)
  WHERE due_at IS NOT NULL;
