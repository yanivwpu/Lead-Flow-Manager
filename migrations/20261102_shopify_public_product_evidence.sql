-- Additive, reviewed Shopify storefront-public product evidence storage.
-- IMPORTANT: Apply this migration to the target database BEFORE deploying code
-- that selects catalog_products.shopify_evidence. Do not apply without a
-- confirmed backup, deployment binding and operator review.
ALTER TABLE public.catalog_products
  ADD COLUMN IF NOT EXISTS shopify_evidence jsonb NOT NULL DEFAULT '[]'::jsonb;
