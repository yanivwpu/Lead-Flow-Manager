-- Merchant workspace activation only; independent from carts, messages and support sends.
ALTER TABLE users ADD COLUMN IF NOT EXISTS ecommerce_growth_engine_activated_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ecommerce_growth_engine_activation_shop TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ecommerce_growth_engine_activation_integration_id VARCHAR;
