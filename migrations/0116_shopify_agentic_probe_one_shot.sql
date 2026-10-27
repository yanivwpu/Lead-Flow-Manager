-- PREPARATION ONLY. Manually reviewed migration; never installed at startup.
-- No row is provisioned here. This journal cannot authorize any Shopify mutation.
CREATE TABLE shopify_agentic_probe_one_shot (
  singleton smallint PRIMARY KEY CHECK (singleton = 1),
  authorization_id uuid NOT NULL UNIQUE,
  workspace_id varchar NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  operator_id varchar NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  shop text NOT NULL,
  integration_id text NOT NULL,
  context_digest text NOT NULL CHECK (context_digest ~ '^[a-f0-9]{64}$'),
  authorized_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  claimed_at timestamptz,
  revoked_at timestamptz,
  CHECK (operator_id = workspace_id),
  CHECK (expires_at > authorized_at AND expires_at <= authorized_at + interval '15 minutes')
);
-- A singleton prevents reissuing a grant after failure, expiry, reload or uncertainty.
-- Only initial claim and irrevocable revocation are mutable. No erase/reset/rebinding.
CREATE FUNCTION preserve_agentic_probe_one_shot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'agentic_probe_authorization_immutable'; END IF;
  IF ROW(NEW.singleton,NEW.authorization_id,NEW.workspace_id,NEW.operator_id,NEW.shop,NEW.integration_id,
         NEW.context_digest,NEW.authorized_at,NEW.expires_at)
     IS DISTINCT FROM ROW(OLD.singleton,OLD.authorization_id,OLD.workspace_id,OLD.operator_id,OLD.shop,OLD.integration_id,
         OLD.context_digest,OLD.authorized_at,OLD.expires_at)
     OR (OLD.claimed_at IS NOT NULL AND NEW.claimed_at IS DISTINCT FROM OLD.claimed_at)
     OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at)
  THEN RAISE EXCEPTION 'agentic_probe_authorization_immutable'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER preserve_agentic_probe_one_shot BEFORE UPDATE OR DELETE ON shopify_agentic_probe_one_shot
  FOR EACH ROW EXECUTE FUNCTION preserve_agentic_probe_one_shot();
