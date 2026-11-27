-- Additive presentation settings only. Never rewrite a contact's CRM stage.
CREATE TABLE IF NOT EXISTS workspace_pipeline_layouts (
  workspace_id varchar PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  stages jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
