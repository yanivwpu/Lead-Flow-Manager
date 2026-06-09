/**
 * Inventory cap + geographic scope helpers.
 * Run: npx tsx tests/inventory-cap-enforcement.test.ts
 */
import {
  normalizedListingInSyncAreaScope,
  readInventorySyncScope,
} from "../shared/inventory/reso/resoSyncScope";
import { isMatchableInventoryStatus } from "../shared/inventory/inventoryListingSchema";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const pompano = { address: { city: "Pompano Beach", zip: "33064" } };
const miami = { address: { city: "Miami", zip: "33139" } };

assert(
  normalizedListingInSyncAreaScope(pompano, readInventorySyncScope({ syncCities: ["Pompano Beach"] })),
  "city scope matches",
);
assert(
  !normalizedListingInSyncAreaScope(miami, readInventorySyncScope({ syncCities: ["Pompano Beach"] })),
  "city scope rejects other city",
);
assert(
  normalizedListingInSyncAreaScope(miami, readInventorySyncScope({ syncZipCodes: ["33139"] })),
  "zip scope matches",
);
assert(
  normalizedListingInSyncAreaScope(miami, {
    cities: ["Pompano Beach"],
    zipCodes: ["33139"],
    maxListings: 1000,
  }),
  "city OR zip scope accepts zip match",
);
assert(
  normalizedListingInSyncAreaScope(pompano, readInventorySyncScope({})),
  "empty scope allows all",
);

assert(isMatchableInventoryStatus("active"), "active is matchable");
assert(isMatchableInventoryStatus("coming_soon"), "coming_soon is matchable");
assert(!isMatchableInventoryStatus("sold"), "sold is not matchable");

console.log("inventory-cap-enforcement.test.ts: OK");
