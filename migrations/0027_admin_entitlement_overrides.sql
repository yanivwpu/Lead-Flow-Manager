-- Admin-only entitlement overrides (access in app; does not modify Stripe/Shopify subscriptions).

ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_brain_entitlement_override_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_brain_entitlement_override_grant boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS growth_engine_entitlement_override_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS growth_engine_entitlement_override_grant boolean NOT NULL DEFAULT false;
