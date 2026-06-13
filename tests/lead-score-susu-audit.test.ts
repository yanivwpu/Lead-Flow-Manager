/**
 * Susu lead score audit — score breakdown for rent → buy pivot.
 * Run: npx tsx tests/lead-score-susu-audit.test.ts
 */
import { scoreLead } from "../client/src/lib/leadScoring";
import { analyzeConversation } from "../client/src/lib/conversationIntelligence";
import { assessBuyerQualification } from "../shared/buyerQualification";
import { mergeBuyerPreferenceProfile } from "../shared/buyerPreferenceMerge";
import { emptyBuyerPreferenceProfile } from "../shared/buyerPreferenceSchema";
import { heuristicPatchFromInboundText } from "../shared/buyerPreferenceExtractionNormalize";
import { parseBuyerSearchCommand } from "../shared/buyerSearchCommand";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function breakdown(label: string, messages: { direction: "inbound" | "outbound"; content: string }[], crmScore?: number) {
  const scored = scoreLead(messages, { industry: "real_estate" }, { isRealEstate: true });
  const intel = analyzeConversation(messages, {
    isRealEstate: true,
    crmLeadScore: crmScore ?? null,
  });

  console.log(`\n=== ${label} ===`);
  console.log("scoreLead:", {
    score: scored.score,
    bucket: scored.bucket,
    core: scored.signals.core,
    industryBonus: scored.signals.industry?.bonus ?? 0,
    detected: scored.signals.detected,
    decisionOverride: scored.signals.decisionOverride,
    dealReadyOverride: scored.signals.dealReadyOverride,
    missingRequired: scored.missingRequired,
    reasons: scored.reasons,
  });
  console.log("analyzeConversation display:", {
    displayScore: intel.leadScoreDetails?.score,
    displayBucket: intel.leadScoreDetails?.bucket,
    scoreSource: intel.leadScoreDetails?.scoreSource,
    label: intel.leadScore.label,
    intent: intel.intent,
    hasBudget: intel.hasBudget,
    hasTimeline: intel.hasTimeline,
    hasFinancing: intel.hasFinancing,
    aiState: intel.aiState,
  });

  return { scored, intel };
}

const rentalMsg = "Show me SFH for rent in Pompano 3/2 between $3000 and $3400";
const buyPivotMsg = "Show me homes for sale in Pompano with pool up to $850k";

const earlyThread = [
  { direction: "inbound" as const, content: "Hi, I'm interested in properties in Pompano" },
  { direction: "outbound" as const, content: "Great! Are you looking to buy or rent?" },
  { direction: "inbound" as const, content: "Looking to buy a home in Pompano up to $900k with pool" },
  { direction: "outbound" as const, content: "Perfect — how many beds and baths?" },
];

const afterRental = [...earlyThread, { direction: "inbound" as const, content: rentalMsg }];
const afterBuyPivot = [...afterRental, { direction: "inbound" as const, content: buyPivotMsg }];

breakdown("Early buy thread (~90 expected)", earlyThread);
breakdown("After rental request", afterRental);
breakdown("After buy pivot (Susu bug)", afterBuyPivot);

// Simulate cumulative W2-style CRM scores
breakdown("After buy pivot + CRM 90", afterBuyPivot, 90);
breakdown("After buy pivot + CRM 77", afterBuyPivot, 77);

// Buyer profile after buy pivot
let profile = emptyBuyerPreferenceProfile();
for (const msg of [earlyThread[2].content, rentalMsg, buyPivotMsg]) {
  const cmd = parseBuyerSearchCommand(msg, profile);
  profile = mergeBuyerPreferenceProfile(profile, cmd.patch, {
    replaceArrayFields: cmd.replaceArrayFields,
  });
}

const qual = assessBuyerQualification({
  profile,
  inboundText: buyPivotMsg,
  leadType: "Buyer",
  matchCount: 5,
});

console.log("\n=== Buyer qualification (profile-based, NOT lead_score) ===");
console.log({
  level: qual.level,
  qualScore: qual.score,
  missing: qual.missing,
  known: qual.known,
  criteriaComplete: qual.criteriaComplete,
  inventoryMode: qual.inventoryMode,
  transactionIntent: profile.transactionIntent?.value,
  bedsMin: profile.bedsMin?.value,
  bathsMin: profile.bathsMin?.value,
  pool: profile.pool?.value,
  priceMax: profile.priceMax?.value,
});

const rentalOnlyThread = [
  { direction: "inbound" as const, content: "Hi, interested in Pompano area" },
  { direction: "outbound" as const, content: "Buy or rent?" },
  { direction: "inbound" as const, content: rentalMsg },
  { direction: "outbound" as const, content: "Here are some options" },
  { direction: "inbound" as const, content: "Show me all the 3/2 in Pompano between $3000 and $3400" },
  { direction: "outbound" as const, content: "Sure" },
  { direction: "inbound" as const, content: "Show me SFH for rent in Pompano up to $3000" },
  { direction: "outbound" as const, content: "Got it" },
];

breakdown("Rental-only thread before buy pivot", [...rentalOnlyThread]);
breakdown("Rental-only thread after buy pivot", [...rentalOnlyThread, { direction: "inbound" as const, content: buyPivotMsg }]);

// Buy pivot ONLY (no prior deal-ready language)
breakdown("Buy pivot message alone", [{ direction: "inbound", content: buyPivotMsg }]);

// W2-style per-message caps simulation
function w2Signals(msg: string): { signals: string[]; score: number } {
  const msgLower = msg.toLowerCase();
  const signals: string[] = [];
  let score = 0;
  const budgetMatch = msg.match(/\b(\$[\d,]+k?|\d+[\d,]*\s*k\b|\d+[\d,]*\s*million\b)/i);
  if (budgetMatch) {
    signals.push("BUDGET_MENTIONED");
    score += 20;
  }
  const isBuyer = /\b(buy|purchase|looking for|apartment|house|condo)\b/.test(msgLower);
  if (/\b(homes?\s+for\s+sale|for\s+sale)\b/i.test(msg)) {
    signals.push("BUYER_KEYWORD");
  }
  if (/\b(show me|showing|tour|visit)\b/i.test(msgLower) && /\b(home|house|property|listing)\b/i.test(msgLower)) {
    signals.push("SHOWING_REQUEST");
    score += 38;
  }
  if (/\b(rent|rental|for rent)\b/i.test(msgLower)) {
    signals.push("RENT_INTENT");
  }
  if (/\bpool\b/i.test(msgLower)) score += 0; // no W2 signal for pool alone
  const bookingHeavy = signals.some((s) => s === "SHOWING_REQUEST");
  score = Math.min(score, bookingHeavy ? 75 : 60);
  return { signals, score };
}

const susuLikeThread = [
  { direction: "inbound" as const, content: "Hi interested in Pompano" },
  { direction: "outbound" as const, content: "Buy or rent?" },
  { direction: "inbound" as const, content: "Show me all the 3/2 in Pompano between $3000 and $3400" },
  { direction: "outbound" as const, content: "Here are matches" },
  { direction: "inbound" as const, content: "Show me SFH for rent in Pompano up to $3000" },
  { direction: "outbound" as const, content: "Sure" },
];

breakdown("Susu-like before buy (no explicit looking to buy)", susuLikeThread);
breakdown("Susu-like after buy pivot", [...susuLikeThread, { direction: "inbound" as const, content: buyPivotMsg }]);
breakdown("Susu-like after buy + CRM 77", [...susuLikeThread, { direction: "inbound" as const, content: buyPivotMsg }], 77);

// Regression assertions (Susu pivot bug)
const afterBuyScored = scoreLead(
  [...susuLikeThread, { direction: "inbound", content: buyPivotMsg }],
  { industry: "real_estate" },
  { isRealEstate: true },
);
assert(afterBuyScored.score >= 80, `Susu buy pivot score >= 80 (got ${afterBuyScored.score})`);
const mergedIntel = analyzeConversation(
  [...susuLikeThread, { direction: "inbound", content: buyPivotMsg }],
  { isRealEstate: true, crmLeadScore: 66 },
);
assert(
  (mergedIntel.leadScoreDetails?.score ?? 0) >= 80,
  `display score merges above stale CRM 66 (got ${mergedIntel.leadScoreDetails?.score})`,
);
assert(mergedIntel.intent === "Buyer", `intent Buyer (got ${mergedIntel.intent})`);

console.log("\nlead-score-susu-audit.test.ts: OK");

