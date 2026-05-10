-- WhatsApp media-header metadata: approval samples vs runtime-capable templates (sync from Meta).
ALTER TABLE message_templates
  ADD COLUMN IF NOT EXISTS header_format text,
  ADD COLUMN IF NOT EXISTS approved_sample_media_url text,
  ADD COLUMN IF NOT EXISTS approved_sample_media_type text,
  ADD COLUMN IF NOT EXISTS media_runtime_required boolean;

COMMENT ON COLUMN message_templates.header_format IS 'HEADER component format from Meta (text|image|video|document); mirrors header_type for media rows.';
COMMENT ON COLUMN message_templates.approved_sample_media_url IS 'Sample URL from Meta example.header_handle — preview/default only; may be overridden at send time.';
COMMENT ON COLUMN message_templates.approved_sample_media_type IS 'Sample media kind for preview (image|video|document).';
COMMENT ON COLUMN message_templates.media_runtime_required IS 'True when header expects runtime media link (image/video/document dynamic sends).';
