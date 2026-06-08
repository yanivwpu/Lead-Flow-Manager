/**
 * RESO sync scope filter tests.
 * Run: npx tsx tests/inventory-sync-scope.test.ts
 */
import {
  appendScopeToPropertyFilter,
  buildSyncableStandardStatusFilter,
  buildSyncScopeConfigPatch,
  parseCommaSeparatedList,
  readInventorySyncScope,
} from "../shared/inventory/reso/resoSyncScope";
import { mapResoStandardStatus } from "../shared/inventory/reso/resoNormalizer";
import { isMatchableInventoryStatus } from "../shared/inventory/inventoryListingSchema";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(
  buildSyncableStandardStatusFilter().includes("Coming Soon"),
  "status filter includes Coming Soon",
);

const statusFilter = buildSyncableStandardStatusFilter();
const areaFilter = appendScopeToPropertyFilter("", "initial", {
  cities: ["Miami", "Fort Lauderdale"],
  zipCodes: ["33301"],
});
assert(areaFilter.includes("StandardStatus eq 'Active'"), "initial filter includes Active");
assert(areaFilter.includes("City eq 'Miami'"), "initial filter includes Miami");
assert(areaFilter.includes("PostalCode eq '33301'"), "initial filter includes zip");

const incremental = appendScopeToPropertyFilter("ModificationTimestamp gt 2024-01-01", "incremental", {
  cities: ["Miami"],
  zipCodes: [],
});
assert(!incremental.includes("StandardStatus"), "incremental omits status filter");
assert(incremental.includes("ModificationTimestamp gt"), "incremental keeps mod cursor");

assert(mapResoStandardStatus("Coming Soon") === "coming_soon", "Coming Soon maps to coming_soon");
assert(isMatchableInventoryStatus("coming_soon"), "coming_soon is matchable");

const patch = buildSyncScopeConfigPatch({
  syncCities: "Miami, Hollywood",
  syncZipCodes: "33139",
  maxListings: 1000,
});
assert(patch.syncCities?.length === 2, "cities parsed");
assert(readInventorySyncScope({ ...patch }).maxListings === 1000, "max listings default read");

assert(parseCommaSeparatedList(" 33301 , 33304 ").length === 2, "csv parse trims");

console.log("inventory-sync-scope.test.ts: OK");
