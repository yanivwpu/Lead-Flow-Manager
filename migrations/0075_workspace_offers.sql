-- Workspace Offers & Payment Links (AI Brain Live Business Data)
-- Tenant: user_id → users.id (workspace owner). Not derived from website knowledge scans.

CREATE TABLE IF NOT EXISTS workspace_offers (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  internal_name text NOT NULL,
  display_name text NOT NULL,
  description text,
  benefits jsonb NOT NULL DEFAULT '[]'::jsonb,
  price_display text,
  billing_cadence text NOT NULL DEFAULT 'once',
  checkout_url text,
  follow_up_url text,
  availability text NOT NULL DEFAULT 'available',
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  category text,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  ai_guidance text,
  archived_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspace_offers_user_active_sort_idx
  ON workspace_offers (user_id, active, sort_order);

CREATE INDEX IF NOT EXISTS workspace_offers_user_archived_idx
  ON workspace_offers (user_id, archived_at);
