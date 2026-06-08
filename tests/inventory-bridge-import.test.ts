/**
 * RESO normalizer timestamp + import phase checks.
 * Run: npx tsx tests/inventory-bridge-import.test.ts
 */
import { normalizeResoPropertyRow, mapResoStandardStatus } from "../shared/inventory/reso/resoNormalizer";
import { deriveInventorySourcePhase } from "../shared/inventory/inventorySourcePhase";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const normalized = normalizeResoPropertyRow(
  {
    ListingId: "M123",
    StandardStatus: "Active",
    ListPrice: 450000,
    BridgeModificationTimestamp: "2024-06-01T12:00:00",
    UnparsedAddress: "123 Main St",
    City: "Miami",
    StateOrProvince: "FL",
  },
  {
    provider: "bridge_interactive",
    extractListingId(row) {
      return String(row.ListingId ?? "");
    },
    resolveStatus(row) {
      return mapResoStandardStatus(row.StandardStatus);
    },
  },
  { modificationTimestampField: "BridgeModificationTimestamp" },
);

assert(normalized != null, "Bridge row normalizes");
assert(
  normalized!.sourceUpdatedAt?.endsWith("Z") === true,
  "Bridge timestamp coerced to valid ISO datetime",
);

const runningPhase = deriveInventorySourcePhase({
  connectionStatus: "connected",
  lastSyncStatus: "running",
  config: {},
  listingCount: 0,
  lastSyncStats: {
    pagesFetched: 3,
    listingsFetched: 4500,
    listingsImported: 120,
  },
});

assert(runningPhase.phase === "initial_import_running", "running phase during initial import");
assert(runningPhase.detail?.includes("4,500 listings fetched") === true, "shows fetched count while running");
assert(runningPhase.detail?.includes("120 imported") === true, "shows imported count while running");

console.log("inventory-bridge-import.test.ts: OK");
