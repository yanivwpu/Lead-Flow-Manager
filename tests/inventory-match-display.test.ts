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

const mediumSummary = formatInventoryMatchSummaryForAi({
  matchCount: 3,
  matches: [{ listing: { city: "Pompano Beach" } }],
  qualificationLevel: "medium",
});
assert(mediumSummary.includes("do NOT mention match counts"), "medium tier suppresses counts");
assert(mediumSummary.includes("ONE question"), "medium tier directs qualification");

const highSummary = formatInventoryMatchSummaryForAi({
  matchCount: 3,
  matches: [
    { listing: { city: "pompano beach" } },
    { listing: { city: "Pompano Beach" } },
  ],
  qualificationLevel: "high",
});
assert(highSummary.includes("a few homes"), "high tier uses soft match language");
assert(highSummary.includes("Pompano Beach"), "high tier includes area");
assert(!highSummary.includes("3 properties"), "high tier avoids exact counts");

const fallbackAreas = formatInventoryMatchSummaryForAi({
  matchCount: 2,
  matches: [{ listing: { city: null } }],
  buyerAreas: ["fort lauderdale"],
  qualificationLevel: "high",
});
assert(fallbackAreas.includes("Fort Lauderdale"), "fallback buyer area");

console.log("inventory-match-display.test.ts: all passed");
