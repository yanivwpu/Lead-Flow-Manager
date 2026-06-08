/**
 * Bridge replication query constraints.
 * Run: npx tsx tests/inventory-bridge-replication.test.ts
 */
import { buildPropertyCollectionUrl } from "../shared/inventory/reso/resoOData";
import { BRIDGE_ODATA_BASE } from "../server/inventory/providers/bridgeInteractiveResoProvider";
import { appendScopeToPropertyFilter } from "../shared/inventory/reso/resoSyncScope";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const filter = appendScopeToPropertyFilter("", "initial", {
  cities: ["Miami"],
  zipCodes: [],
});

const url = buildPropertyCollectionUrl(`${BRIDGE_ODATA_BASE}/miamire`, "Property/replication", {
  filter,
  top: 2000,
  orderBy: undefined,
});

assert(!url.includes("$orderby"), "Bridge replication URL must not include $orderby");
assert(url.includes("miamire"), "dataset in URL");
assert(url.includes("$filter="), "filter in URL");
assert(filter.includes("StandardStatus eq 'Active'"), "active status in filter");
assert(filter.includes("City eq 'Miami'"), "city in filter");

console.log("inventory-bridge-replication.test.ts: OK");
