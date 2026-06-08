/**
 * Inventory match AI summary formatting.
 * Run: npx tsx tests/inventory-match-display.test.ts
 */
import { formatInventoryMatchSummaryForAi } from "../shared/inventory/inventoryMatchDisplay";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(
  formatInventoryMatchSummaryForAi({ matchCount: 0, matches: [] }) === "",
  "empty when no matches",
);

const singleCity = formatInventoryMatchSummaryForAi({
  matchCount: 3,
  matches: [
    { listing: { city: "pompano beach" } },
    { listing: { city: "Pompano Beach" } },
    { listing: { city: "pompano beach" } },
  ],
});
assert(singleCity.includes("3 properties"), "single city count");
assert(singleCity.includes("Pompano Beach"), "single city name");
assert(singleCity.includes("not yet sent"), "not yet sent note");

const fallbackAreas = formatInventoryMatchSummaryForAi({
  matchCount: 2,
  matches: [{ listing: { city: null } }, { listing: { city: null } }],
  buyerAreas: ["fort lauderdale"],
});
assert(fallbackAreas.includes("2 properties"), "fallback count");
assert(fallbackAreas.includes("Fort Lauderdale"), "fallback buyer area");

const multiCity = formatInventoryMatchSummaryForAi({
  matchCount: 4,
  matches: [
    { listing: { city: "Pompano Beach" } },
    { listing: { city: "Pompano Beach" } },
    { listing: { city: "Deerfield Beach" } },
    { listing: { city: "Lighthouse Point" } },
  ],
});
assert(multiCity.includes("Pompano Beach"), "primary city");
assert(multiCity.includes("Deerfield Beach"), "secondary city");

console.log("inventory-match-display.test.ts: all passed");
