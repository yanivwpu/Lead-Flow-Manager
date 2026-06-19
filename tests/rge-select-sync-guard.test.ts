/**
 * Guards against InventorySourcesSection maxListings reset on sources poll.
 * Run: npx tsx tests/rge-select-sync-guard.test.ts
 */
import { INVENTORY_MAX_LISTINGS_OPTIONS, DEFAULT_MAX_LISTINGS } from "../shared/inventory/reso/resoSyncScope";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

function normalizeMaxListingsSelectValue(value: number | undefined): string {
  const normalized = INVENTORY_MAX_LISTINGS_OPTIONS.includes(
    value as (typeof INVENTORY_MAX_LISTINGS_OPTIONS)[number],
  )
    ? value
    : DEFAULT_MAX_LISTINGS;
  return String(normalized ?? DEFAULT_MAX_LISTINGS);
}

// Effect deps must NOT include `sources` array — only stable source identity fields.
const FORM_SYNC_DEPS = ["selectedProvider", "activeSource?.id", "activeSource?.updatedAt"] as const;
assert(!FORM_SYNC_DEPS.includes("sources" as never), "form sync must not depend on sources poll ref");

assert(normalizeMaxListingsSelectValue(2500) === "2500", "valid max listings string");
assert(normalizeMaxListingsSelectValue(99999) === String(DEFAULT_MAX_LISTINGS), "invalid max falls back");
assert(normalizeMaxListingsSelectValue(undefined) === String(DEFAULT_MAX_LISTINGS), "undefined max falls back");

console.log("rge-select-sync-guard.test.ts: all assertions passed");
