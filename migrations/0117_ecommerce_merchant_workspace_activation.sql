-- Merchant's explicit E-Commerce workspace activation. No cart, send or order permissions.
-- Isolated table: existing users and Shopify data remain usable before this migration.
CREATE TABLE IF NOT EXISTS ecommerce_shopify_workspace_activations (
  account_id VARCHAR PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  installation_id VARCHAR NOT NULL UNIQUE REFERENCES integrations(id) ON DELETE CASCADE,
  shop TEXT NOT NULL,
  activated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT ecommerce_shopify_workspace_shop_chk CHECK (shop LIKE '%.myshopify.com')
);
