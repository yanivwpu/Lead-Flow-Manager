-- Merchant-facing workspace activation only. No cart or outbound enablement.
ALTER TABLE users ADD COLUMN IF NOT EXISTS ecommerce_growth_engine_activated_at TIMESTAMP;
