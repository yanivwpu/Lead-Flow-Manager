-- Additive, repeat-safe. Existing published neighborhood pages retain their content.
ALTER TABLE agent_neighborhood_pages
  ADD COLUMN IF NOT EXISTS photos jsonb NOT NULL DEFAULT '[]'::jsonb;
