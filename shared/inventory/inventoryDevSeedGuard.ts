/**
 * Production guard for dev-seed / test inventory.
 * Prevents mock MLS data from powering real matching, sync, or drafts.
 */

export const DEV_SEED_ORIGINATING_SYSTEM = "dev-seed";
export const DEV_SEED_LISTING_ID_PREFIX = "dev-seed-";

export const DEV_SEED_PRODUCTION_BLOCK_MESSAGE =
  "Dev-seed test inventory is not allowed in production. Remove the dev source or connect a real MLS provider.";

/** True when production dev-seed guards should apply. */
export function isProductionDevSeedGuardEnabled(): boolean {
  return process.env.NODE_ENV === "production";
}

export function isDevSeedOriginatingSystem(value: string | null | undefined): boolean {
  if (!value?.trim()) return false;
  const v = value.trim().toLowerCase();
  return v === DEV_SEED_ORIGINATING_SYSTEM || v.includes(DEV_SEED_ORIGINATING_SYSTEM);
}

export function isDevSeedProviderListingId(value: string | null | undefined): boolean {
  if (!value?.trim()) return false;
  return value.trim().toLowerCase().startsWith(DEV_SEED_LISTING_ID_PREFIX);
}

export function isDevSeedSourceConfig(config: Record<string, unknown> | null | undefined): boolean {
  if (!config) return false;
  const orig = config.originatingSystemName;
  return typeof orig === "string" && isDevSeedOriginatingSystem(orig);
}

export function isDevSeedInventorySource(source: {
  config?: Record<string, unknown> | null;
}): boolean {
  return isDevSeedSourceConfig((source.config || {}) as Record<string, unknown>);
}

export type DevSeedGuardResult = { ok: true } | { ok: false; message: string; code: "dev_seed_not_allowed" };

export function assertProductionDevSeedSourceAllowed(
  config: Record<string, unknown> | null | undefined,
): DevSeedGuardResult {
  if (!isProductionDevSeedGuardEnabled()) return { ok: true };
  if (isDevSeedSourceConfig(config)) {
    return { ok: false, code: "dev_seed_not_allowed", message: DEV_SEED_PRODUCTION_BLOCK_MESSAGE };
  }
  return { ok: true };
}

export function assertProductionDevSeedListingAllowed(providerListingId: string): DevSeedGuardResult {
  if (!isProductionDevSeedGuardEnabled()) return { ok: true };
  if (isDevSeedProviderListingId(providerListingId)) {
    return { ok: false, code: "dev_seed_not_allowed", message: DEV_SEED_PRODUCTION_BLOCK_MESSAGE };
  }
  return { ok: true };
}
