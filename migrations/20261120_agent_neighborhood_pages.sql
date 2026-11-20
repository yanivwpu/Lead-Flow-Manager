CREATE TABLE IF NOT EXISTS agent_neighborhood_pages (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  city text NOT NULL,
  state text NOT NULL,
  content text NOT NULL,
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_neighborhood_pages_owner_slug_unique UNIQUE (user_id, slug)
);
CREATE INDEX IF NOT EXISTS agent_neighborhood_pages_published_idx ON agent_neighborhood_pages (id) WHERE published;
