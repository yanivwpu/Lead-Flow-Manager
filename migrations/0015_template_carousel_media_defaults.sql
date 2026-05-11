-- Per-user last-used carousel card media URLs for WhatsApp library templates (R2/https).
CREATE TABLE IF NOT EXISTS template_carousel_media_defaults (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_id varchar NOT NULL REFERENCES message_templates(id) ON DELETE CASCADE,
  card_media jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS template_carousel_media_defaults_user_template_uq
  ON template_carousel_media_defaults (user_id, template_id);

CREATE INDEX IF NOT EXISTS template_carousel_media_defaults_user_id_idx
  ON template_carousel_media_defaults (user_id);
