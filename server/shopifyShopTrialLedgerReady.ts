/**
 * Tracks readiness of migration 0084 (shopify_shop_trials table + idempotent backfill).
 * OAuth must not insert or grant a shop trial until this is true.
 */
let shopifyShopTrialLedgerReady = false;

export function setShopifyShopTrialLedgerReady(ready: boolean): void {
  shopifyShopTrialLedgerReady = ready;
}

export function isShopifyShopTrialLedgerReady(): boolean {
  return shopifyShopTrialLedgerReady;
}
