CREATE TABLE IF NOT EXISTS templates (
  id VARCHAR PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_premium BOOLEAN DEFAULT false,
  version TEXT DEFAULT '1.0.0',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS template_entitlements (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL,
  purchased_at TIMESTAMP,
  onboarding_submitted_at TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'locked',
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, template_id)
);

CREATE TABLE IF NOT EXISTS realtor_onboarding_submissions (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL DEFAULT 'realtor-growth-engine',
  submitted_at TIMESTAMP DEFAULT NOW(),
  payload JSONB NOT NULL,
  normalized JSONB,
  status TEXT NOT NULL DEFAULT 'submitted'
);

CREATE TABLE IF NOT EXISTS template_installs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL,
  installed_at TIMESTAMP,
  install_status TEXT NOT NULL DEFAULT 'pending',
  install_log TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS template_assets (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  version TEXT DEFAULT '1.0.0',
  definition JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_template_data (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  asset_key TEXT NOT NULL,
  definition JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, template_id, asset_type, asset_key)
);
