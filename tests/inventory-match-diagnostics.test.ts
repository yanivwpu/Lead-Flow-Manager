/**
 * Inventory match diagnostics builder.
 * Run: npx tsx tests/inventory-match-diagnostics.test.ts
 */
import {
  buildInventoryMatchDiagnostics,
  formatInventoryMatchRunTime,
} from "../shared/inventory/inventoryMatchDiagnostics";
import { inventoryMatchDiagnosticsSchema } from "../shared/inventory/inventoryMatchTypes";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const built = buildInventoryMatchDiagnostics({
  activeInventoryCount: 613,
  listingsScored: 613,
  matchesReturned: 4,
  lastMatchingError: null,
  lastMatchRunAt: "2026-06-09T12:00:00.000Z",
});

const parsed = inventoryMatchDiagnosticsSchema.safeParse(built);
assert(parsed.success, "diagnostics schema validates");
assert(built.activeInventoryCount === 613, "active count");
assert(built.matchesReturned === 4, "matches returned");
assert(built.lastMatchingError === null, "no error");
assert(formatInventoryMatchRunTime(built.lastMatchRunAt).length > 0, "formats run time");

const withError = buildInventoryMatchDiagnostics({
  activeInventoryCount: 100,
  listingsScored: 0,
  matchesReturned: 0,
  lastMatchingError: 'column "square_feet" does not exist',
});
assert(withError.lastMatchingError?.includes("square_feet") === true, "stores error");

console.log("inventory-match-diagnostics.test.ts: OK");
