/**
 * Streaming import + resume checkpoint tests.
 * Run: npx tsx tests/inventory-streaming-import.test.ts
 */
import { maxTimestampFromRows, readResoSyncCursor, mergeResoSyncCursor } from "../shared/inventory/reso/resoSyncTypes";
import { normalizeResoPropertyRow, mapResoStandardStatus } from "../shared/inventory/reso/resoNormalizer";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const row = {
  ListingId: "A100",
  StandardStatus: "Active",
  ListPrice: 500000,
  BridgeModificationTimestamp: "2024-06-01T12:00:00",
  UnparsedAddress: "100 Ocean Dr",
  City: "Miami Beach",
  StateOrProvince: "FL",
  Latitude: "25.7907",
  Longitude: "-80.1300",
  BedroomsTotal: "3",
  BathroomsTotalInteger: "2",
};

const normalized = normalizeResoPropertyRow(
  row,
  {
    provider: "bridge_interactive",
    extractListingId(r) {
      return String(r.ListingId ?? "");
    },
    resolveStatus(r) {
      return mapResoStandardStatus(r.StandardStatus);
    },
  },
  { modificationTimestampField: "BridgeModificationTimestamp" },
);

assert(normalized != null, "Bridge row with string coords normalizes");
assert(normalized!.latitude === 25.7907, "latitude parsed from string");
assert(normalized!.beds === 3, "beds parsed from string");

const maxTs = maxTimestampFromRows([row], "BridgeModificationTimestamp");
assert(typeof maxTs === "string" && maxTs.length > 0, "max timestamp from rows");

const merged = mergeResoSyncCursor({}, {
  initialImportResumeUrl: "https://api.example/next",
  maxModificationTimestamp: maxTs,
});
assert(
  readResoSyncCursor(merged).initialImportResumeUrl?.includes("next") === true,
  "resume URL stored in cursor",
);

console.log("inventory-streaming-import.test.ts: OK");
