/**
 * Guards against InventorySourcesSection resetting dirty form state on sources poll.
 * Run: npx tsx tests/rge-select-sync-guard.test.ts
 */
import { INVENTORY_MAX_LISTINGS_OPTIONS, DEFAULT_MAX_LISTINGS } from "../shared/inventory/reso/resoSyncScope";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  inventoryFormHydrationIdentity,
  shouldResetInventoryForm,
} from "../client/src/lib/inventorySourceFormState";

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

const section = readFileSync(
  join(process.cwd(), "client", "src", "components", "inventory", "InventorySourcesSection.tsx"),
  "utf8",
);

assert(
  section.includes("shouldResetInventoryForm"),
  "form hydrate must use identity guard so polls cannot wipe dirty values",
);
assert(
  !section.includes("activeSource?.updatedAt"),
  "form hydrate must not reset when source updatedAt changes on poll",
);

const identity = inventoryFormHydrationIdentity({
  workspaceUserId: "ws-1",
  selectedProvider: "bridge_interactive",
  sourceId: "src-1",
});
assert(
  shouldResetInventoryForm(identity, identity) === false,
  "same identity after refetch/tab must keep dirty form",
);

assert(normalizeMaxListingsSelectValue(2500) === "2500", "valid max listings string");
assert(normalizeMaxListingsSelectValue(99999) === String(DEFAULT_MAX_LISTINGS), "invalid max falls back");
assert(normalizeMaxListingsSelectValue(undefined) === String(DEFAULT_MAX_LISTINGS), "undefined max falls back");

console.log("rge-select-sync-guard.test.ts: all assertions passed");
