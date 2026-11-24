-- Additive, repeat-safe, and preserves every existing public neighborhood URL.
-- Existing pages were US-only, so historic records retain US identity.
ALTER TABLE agent_neighborhood_pages
  ADD COLUMN IF NOT EXISTS country varchar(2) NOT NULL DEFAULT 'US';
ALTER TABLE agent_neighborhood_pages
  ADD COLUMN IF NOT EXISTS custom_boundary jsonb;
-- The server validates shapes, owner scope and explicit custom-area provenance.
-- Never populate custom geometry by guessing from a ZIP, radius or city bbox.
