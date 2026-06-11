/**
 * Budget range extraction + merge + AI/inventory source-of-truth alignment.
 * Run: npx tsx tests/budget-range-audit.test.ts
 */
import { heuristicPatchFromInboundText } from "../shared/buyerPreferenceExtractionNormalize";
import { mergeBuyerPreferenceProfile } from "../shared/buyerPreferenceMerge";
import { emptyBuyerPreferenceProfile } from "../shared/buyerPreferenceSchema";
import {
  formatBuyerPreferenceSummaryForAi,
  formatBuyerPreferenceBudgetLabel,
} from "../shared/buyerPreferenceDisplay";
import { extractBuyerMatchCriteria } from "../shared/inventory/inventoryMatchScoring";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const m1 = "Show me 3/2 with pool in Pompano Beach up to $550k";
const m2 = "Show me 3/2 with pool in Pompano Beach between $1,000,000 - $1,500,000";
const m3 = "Show me 3/2 with pool in Pompano Beach between 1m and 1.5m";
const m4 = "3/2 with pool in Pompano 1m to 1.5m";

const p1 = heuristicPatchFromInboundText(m1);
assert(p1.priceMax?.value === 550_000, "m1 up to 550k");

const p2 = heuristicPatchFromInboundText(m2);
assert(p2.priceMin?.value === 1_000_000 && p2.priceMax?.value === 1_500_000, "m2 comma range");

const p3 = heuristicPatchFromInboundText(m3);
assert(p3.priceMin?.value === 1_000_000 && p3.priceMax?.value === 1_500_000, "m3 verbal between range");

const p4 = heuristicPatchFromInboundText(m4);
assert(p4.priceMin?.value === 1_000_000 && p4.priceMax?.value === 1_500_000, "m4 1m to 1.5m");

let profile = mergeBuyerPreferenceProfile(emptyBuyerPreferenceProfile(), p1, undefined, {
  replaceArrayFields: ["targetAreas"],
});
profile = mergeBuyerPreferenceProfile(profile, p2, undefined, {
  replaceArrayFields: ["targetAreas"],
});

assert(
  profile.priceMin?.value === 1_000_000 && profile.priceMax?.value === 1_500_000,
  "merged profile replaces old $550k cap with $1M-$1.5M range",
);

const criteria = extractBuyerMatchCriteria(profile);
assert(criteria.priceMin === 1_000_000 && criteria.priceMax === 1_500_000, "matching uses merged range");

const budgetLabel = formatBuyerPreferenceBudgetLabel(profile);
assert(
  budgetLabel != null && budgetLabel.includes("1") && budgetLabel.includes("1.5"),
  "AI budget label from profile",
);
assert(
  formatBuyerPreferenceSummaryForAi(profile).includes("Budget"),
  "AI summary includes budget from profile",
);

const mUpToMil =
  "Show me 4/2 up to 2000 SqFt with pool and up to $1mil in Pompano Beach";
const pUpToMil = heuristicPatchFromInboundText(mUpToMil);
assert(pUpToMil.priceMax?.value === 1_000_000, "dual up-to: budget is $1M not 2000 sqft");
assert(pUpToMil.priceMin == null, "dual up-to: no priceMin");
assert(
  pUpToMil.mustHaves?.value?.some((v) => String(v).startsWith("sqft_max:2000")),
  "dual up-to: sqft max preserved",
);

console.log("budget-range-audit.test.ts: all passed");
