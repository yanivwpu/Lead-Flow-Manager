-- Reviewed, manually applied migration only. No startup installation or grants.
-- The original shopify_checkout_admin_one_dispatch index is NOT altered.
CREATE TABLE shopify_private_cart_second_authorization (
  attempt_number smallint PRIMARY KEY CHECK (attempt_number = 2),
  authorization_id uuid NOT NULL UNIQUE,
  original_request_id uuid NOT NULL UNIQUE REFERENCES shopify_checkout_admin_tests(request_id) ON DELETE RESTRICT,
  workspace_id varchar NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  operator_id varchar NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  shop text NOT NULL CHECK (shop = 'whachatcrm.myshopify.com'),
  integration_id text NOT NULL,
  installation_digest text NOT NULL,
  approved_by varchar NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approval_reference text NOT NULL CHECK (length(approval_reference) BETWEEN 1 AND 256),
  authorized_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  request_id uuid UNIQUE REFERENCES shopify_checkout_admin_tests(request_id) ON DELETE RESTRICT,
  scope_digest text,
  claimed_at timestamptz,
  dispatch_started_at timestamptz,
  encrypted_receipt text,
  receipt_at timestamptz,
  verified_at timestamptz,
  revoked_at timestamptz,
  diagnostic jsonb,
  CHECK (operator_id = workspace_id AND approved_by = operator_id),
  CHECK (expires_at > authorized_at),
  CHECK ((claimed_at IS NULL AND request_id IS NULL AND scope_digest IS NULL) OR
         (claimed_at IS NOT NULL AND request_id IS NOT NULL AND scope_digest IS NOT NULL AND scope_digest ~ '^[a-f0-9]{64}$')),
  CHECK (dispatch_started_at IS NULL OR claimed_at IS NOT NULL),
  CHECK (encrypted_receipt IS NULL OR (receipt_at IS NOT NULL AND dispatch_started_at IS NOT NULL)),
  CHECK (verified_at IS NULL OR receipt_at IS NOT NULL)
);
-- A consumed authorization is never reset or rebound, even by an accidental SQL update.
-- Privacy cleanup may erase encrypted_receipt/diagnostic and revoke the authorization.
CREATE FUNCTION preserve_private_cart_second_authorization() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'private_cart_authorization_immutable'; END IF;
  IF ROW(NEW.attempt_number,NEW.authorization_id,NEW.original_request_id,NEW.workspace_id,NEW.operator_id,
         NEW.shop,NEW.integration_id,NEW.installation_digest,NEW.approved_by,NEW.approval_reference,NEW.authorized_at,NEW.expires_at)
     IS DISTINCT FROM
     ROW(OLD.attempt_number,OLD.authorization_id,OLD.original_request_id,OLD.workspace_id,OLD.operator_id,
         OLD.shop,OLD.integration_id,OLD.installation_digest,OLD.approved_by,OLD.approval_reference,OLD.authorized_at,OLD.expires_at)
     OR (OLD.claimed_at IS NOT NULL AND ROW(NEW.claimed_at,NEW.request_id,NEW.scope_digest)
         IS DISTINCT FROM ROW(OLD.claimed_at,OLD.request_id,OLD.scope_digest))
     OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at)
     OR (OLD.dispatch_started_at IS NOT NULL AND NEW.dispatch_started_at IS DISTINCT FROM OLD.dispatch_started_at)
     OR (OLD.receipt_at IS NOT NULL AND NEW.receipt_at IS DISTINCT FROM OLD.receipt_at)
     OR (OLD.verified_at IS NOT NULL AND NEW.verified_at IS DISTINCT FROM OLD.verified_at)
  THEN RAISE EXCEPTION 'private_cart_authorization_immutable'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER preserve_private_cart_second_authorization
  BEFORE UPDATE OR DELETE ON shopify_private_cart_second_authorization
  FOR EACH ROW EXECUTE FUNCTION preserve_private_cart_second_authorization();
