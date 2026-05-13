-- Growth Engine internal logistics: setup specialists + onboarding tasks

ALTER TABLE salespeople ADD COLUMN IF NOT EXISTS calendar_link TEXT;
ALTER TABLE salespeople ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'demo';
ALTER TABLE salespeople ADD COLUMN IF NOT EXISTS setup_tasks_completed INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS growth_engine_setup_tasks (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL DEFAULT 'realtor-growth-engine',
  salesperson_id VARCHAR REFERENCES salespeople(id) ON DELETE SET NULL,
  submission_id VARCHAR REFERENCES realtor_onboarding_submissions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'purchased',
  onboarding_submitted_at TIMESTAMP,
  session_booked_at TIMESTAMP,
  completed_at TIMESTAMP,
  internal_notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, template_id)
);

CREATE INDEX IF NOT EXISTS idx_ge_setup_tasks_salesperson ON growth_engine_setup_tasks(salesperson_id);
CREATE INDEX IF NOT EXISTS idx_ge_setup_tasks_status ON growth_engine_setup_tasks(status);
CREATE INDEX IF NOT EXISTS idx_ge_setup_tasks_user ON growth_engine_setup_tasks(user_id);
