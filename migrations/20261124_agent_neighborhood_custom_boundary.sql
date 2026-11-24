-- Repeat-safe. Existing published pages use their municipal GIS source unchanged.
ALTER TABLE agent_neighborhood_pages
  ADD COLUMN IF NOT EXISTS custom_boundary jsonb;
