-- Additive custom column metadata; canonical CRM stage is unchanged.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS pipeline_custom_stage_id text;
CREATE OR REPLACE FUNCTION clear_custom_pipeline_stage_on_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.pipeline_stage IS DISTINCT FROM OLD.pipeline_stage
     AND NEW.pipeline_custom_stage_id IS NOT DISTINCT FROM OLD.pipeline_custom_stage_id THEN
    NEW.pipeline_custom_stage_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'contacts'::regclass AND tgname = 'contacts_clear_custom_pipeline_stage' AND NOT tgisinternal) THEN
    CREATE TRIGGER contacts_clear_custom_pipeline_stage BEFORE UPDATE OF pipeline_stage ON contacts
      FOR EACH ROW EXECUTE FUNCTION clear_custom_pipeline_stage_on_transition();
  END IF;
END;
$$;
