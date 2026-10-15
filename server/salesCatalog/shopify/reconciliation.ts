const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
function setting(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  const parsed = value?.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed >= min && parsed <= max
    ? parsed
    : fallback;
}
/** Recovery cadence, not an inventory freshness guarantee. Gap starts after a completed full pass. */
export function catalogReconciliationIntervalMs(
  productCount: number,
  previousFullDurationMs = 0,
  env: Record<string, string | undefined> = process.env,
): number {
  const base =
    setting(env.SHOPIFY_CATALOG_RECONCILE_INTERVAL_HOURS, 24, 1, 720) * HOUR;
  const productsPerDay = setting(
    env.SHOPIFY_CATALOG_RECONCILE_PRODUCTS_PER_DAY,
    10_000,
    100,
    100_000,
  );
  const count =
    Number.isSafeInteger(productCount) && productCount > 0 ? productCount : 0;
  const duration =
    Number.isFinite(previousFullDurationMs) && previousFullDurationMs > 0
      ? previousFullDurationMs
      : 0;
  // Size-aware recovery budget plus a four-pass-duration idle gap for observed API quotas/outages.
  return Math.ceil(
    Math.max(base, (count / productsPerDay) * DAY, duration * 4),
  );
}
