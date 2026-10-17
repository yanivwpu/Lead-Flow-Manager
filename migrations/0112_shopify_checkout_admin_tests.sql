-- Reviewed migration only. Never installed by startup or a test endpoint.
CREATE TABLE shopify_checkout_admin_tests (
  request_id uuid PRIMARY KEY,
  workspace_id varchar NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  operator_id varchar NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  session_digest text NOT NULL,
  shop text NOT NULL CHECK (shop = 'whachatcrm.myshopify.com'),
  integration_id text NOT NULL,
  installation_digest text NOT NULL,
  selection jsonb NOT NULL,
  selection_digest text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  approved_at timestamptz,
  claimed_at timestamptz
);
-- One dispatch for this development store, including ambiguous/failed dispatches.
-- Never reset/delete a claim to retry. A further test requires a separate review.
CREATE UNIQUE INDEX shopify_checkout_admin_one_dispatch
  ON shopify_checkout_admin_tests(shop) WHERE claimed_at IS NOT NULL;
