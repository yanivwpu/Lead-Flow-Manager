-- Prospect AI: workspace activation + discovery search/results (quota from result rows)
CREATE TABLE IF NOT EXISTS prospect_ai_activations (
  workspace_user_id varchar PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  activated_by_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'google_places',
  status text NOT NULL DEFAULT 'active',
  activated_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prospect_ai_discovery_searches (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_type text NOT NULL,
  location text NOT NULL,
  radius_km numeric(8, 2),
  provider text NOT NULL DEFAULT 'google_places',
  status text NOT NULL DEFAULT 'completed',
  result_count integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prospect_ai_discovery_searches_workspace_created_idx
  ON prospect_ai_discovery_searches (workspace_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS prospect_ai_discovery_results (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id varchar NOT NULL REFERENCES prospect_ai_discovery_searches(id) ON DELETE CASCADE,
  workspace_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'google_places',
  provider_place_id text NOT NULL,
  name text NOT NULL,
  business_type text,
  address text,
  phone text,
  website text,
  email text,
  latitude double precision,
  longitude double precision,
  rating numeric(3, 1),
  review_count integer,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  contact_id varchar REFERENCES contacts(id) ON DELETE SET NULL,
  sent_to_review_at timestamp,
  created_at timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS prospect_ai_discovery_results_search_place_uq
  ON prospect_ai_discovery_results (search_id, provider_place_id);

CREATE INDEX IF NOT EXISTS prospect_ai_discovery_results_workspace_created_idx
  ON prospect_ai_discovery_results (workspace_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS prospect_ai_discovery_results_workspace_contact_idx
  ON prospect_ai_discovery_results (workspace_user_id, contact_id);
