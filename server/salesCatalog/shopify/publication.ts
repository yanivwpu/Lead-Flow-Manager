/**
 * Online Store publication is independent of URL availability: Shopify suppresses
 * onlineStoreUrl on password-protected/development stores, including published products.
 * No preview URL, product status alone, or app-specific publication implies publication.
 */
export function isShopifyProductPublished(
  product: {
    status?: unknown;
    publishedAt?: unknown;
    requiresSellingPlan?: unknown;
  },
  now = Date.now(),
): boolean {
  const at =
    typeof product.publishedAt === "string"
      ? Date.parse(product.publishedAt)
      : NaN;
  return (
    product.status === "ACTIVE" &&
    Number.isFinite(at) &&
    at <= now &&
    product.requiresSellingPlan === false
  );
}
