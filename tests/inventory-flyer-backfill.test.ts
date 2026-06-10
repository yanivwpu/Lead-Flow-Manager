/**
 * Flyer column backfill helpers.
 * Run: npx tsx tests/inventory-flyer-backfill.test.ts
 */
import {
  expectedSyncCredentialField,
  listingNeedsFlyerColumnBackfill,
} from "../server/inventory/inventoryFlyerBackfill";
import { inventorySourceHasSyncCredentials } from "../server/inventory/inventorySourceService";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(listingNeedsFlyerColumnBackfill({ squareFeet: null, yearBuilt: 1981 }) === true, "missing sqft");
assert(listingNeedsFlyerColumnBackfill({ squareFeet: 1200, yearBuilt: null }) === true, "missing year");
assert(
  listingNeedsFlyerColumnBackfill({ squareFeet: 1200, yearBuilt: 1990 }) === false,
  "both present",
);
assert(
  listingNeedsFlyerColumnBackfill({ squareFeet: 0, yearBuilt: 1990 }) === false,
  "zero sqft still counts as present",
);

assert(expectedSyncCredentialField("bridge_interactive") === "serverToken", "bridge uses serverToken");
assert(expectedSyncCredentialField("mls_grid") === "accessToken", "mls grid uses accessToken");
assert(
  inventorySourceHasSyncCredentials("bridge_interactive", { serverToken: "abc" }) === true,
  "bridge creds detected",
);
assert(
  inventorySourceHasSyncCredentials("bridge_interactive", { accessToken: "abc" }) === false,
  "bridge does not use accessToken",
);
assert(
  inventorySourceHasSyncCredentials("mls_grid", {}) === false,
  "mls grid without accessToken",
);

console.log("inventory-flyer-backfill.test.ts: OK");
