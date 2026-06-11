/**
 * Buyer profile source-of-truth — AI context fields align with matching criteria.
 * Run: npx tsx tests/buyer-profile-source-of-truth.test.ts
 */
import { mergeBuyerPreferenceProfile } from "../shared/buyerPreferenceMerge";
import { emptyBuyerPreferenceProfile } from "../shared/buyerPreferenceSchema";
import {
  buildBuyerPreferenceAiContext,
  formatBuyerPreferenceBudgetLabel,
} from "../shared/buyerPreferenceDisplay";
import { extractBuyerMatchCriteria } from "../shared/inventory/inventoryMatchScoring";
import { heuristicPatchFromInboundText } from "../shared/buyerPreferenceExtractionNormalize";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const now = new Date().toISOString();
const inf = <T>(value: T, evidence = "test") => ({
  value,
  source: "inferred" as const,
  confidence: 0.9,
  updatedAt: now,
  evidence,
});

const rangeMsg =
  "Show me 3/2 with pool in Pompano Beach between $1,000,000 - $1,500,000";
const patch = heuristicPatchFromInboundText(rangeMsg);
const profile = mergeBuyerPreferenceProfile(emptyBuyerPreferenceProfile(), patch);

const criteria = extractBuyerMatchCriteria(profile);
const aiCtx = buildBuyerPreferenceAiContext(profile);
const budgetLabel = formatBuyerPreferenceBudgetLabel(profile);

assert(criteria.priceMin === 1_000_000, "matching priceMin from persisted profile");
assert(criteria.priceMax === 1_500_000, "matching priceMax from persisted profile");
assert(budgetLabel != null && budgetLabel.includes("1"), "display budget label");
assert(aiCtx.budget === budgetLabel, "AI budget matches display label");
assert(
  aiCtx.buyerPreferences?.includes("Budget"),
  "AI summary includes budget from same profile",
);
assert(criteria.hardRequirePool === true, "pool criteria from same profile");

const withTimeline = mergeBuyerPreferenceProfile(profile, {
  timeline: inf("asap", "timeline in message"),
  financingStatus: inf("pre_approved", "financing in message"),
});
const ai2 = buildBuyerPreferenceAiContext(withTimeline);
assert(!!ai2.timeline, "AI timeline from profile chips");
assert(!!ai2.financing, "AI financing from profile chips");

console.log("buyer-profile-source-of-truth.test.ts: all passed");
