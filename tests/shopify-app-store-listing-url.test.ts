/**
 * Shopify App Store listing URL resolution (production install CTA).
 * Run: npx tsx tests/shopify-app-store-listing-url.test.ts
 */
import assert from "node:assert/strict";
import {
  DEFAULT_SHOPIFY_APP_HANDLE,
  resolveShopifyAppStoreListingUrl,
} from "../shared/shopifyManagedPricing";

assert.equal(DEFAULT_SHOPIFY_APP_HANDLE, "whachatcrm");

assert.equal(
  resolveShopifyAppStoreListingUrl(undefined, "whachatcrm"),
  "https://apps.shopify.com/whachatcrm",
  "derives listing from app handle",
);

assert.equal(
  resolveShopifyAppStoreListingUrl("https://apps.shopify.com/whachatcrm", "other"),
  "https://apps.shopify.com/whachatcrm",
  "explicit env URL wins",
);

assert.equal(
  resolveShopifyAppStoreListingUrl("  https://apps.shopify.com/custom  ", "whachatcrm"),
  "https://apps.shopify.com/custom",
  "trims env URL",
);

assert.equal(
  resolveShopifyAppStoreListingUrl("", "WhachatCRM"),
  "https://apps.shopify.com/whachatcrm",
  "normalizes handle case",
);

console.log("PASS shopify-app-store-listing-url.test.ts");
