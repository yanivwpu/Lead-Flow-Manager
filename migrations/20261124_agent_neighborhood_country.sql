-- Additive and repeatable. Existing US guides retain their URL and region.
ALTER TABLE agent_neighborhood_pages
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'US';
