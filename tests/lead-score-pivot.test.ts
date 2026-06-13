/**
 * Lead score must not drop on rent ↔ buy pivots when criteria stay specific.
 * Run: npx tsx tests/lead-score-pivot.test.ts
 */
import { scoreLead } from "../client/src/lib/leadScoring";
import { analyzeConversation } from "../client/src/lib/conversationIntelligence";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const buyPivotMsg = "Show me homes for sale in Pompano with pool up to $850k";
const rentalMsg = "Show me SFH for rent in Pompano up to $3000";

const susuThread = [
  { direction: "inbound" as const, content: "Hi interested in Pompano" },
  { direction: "outbound" as const, content: "Buy or rent?" },
  { direction: "inbound" as const, content: "Show me all the 3/2 in Pompano between $3000 and $3400" },
  { direction: "outbound" as const, content: "Here are matches" },
  { direction: "inbound" as const, content: rentalMsg },
  { direction: "outbound" as const, content: "Sure" },
];

const beforeBuy = scoreLead(susuThread, { industry: "real_estate" }, { isRealEstate: true });
const afterBuy = scoreLead(
  [...susuThread, { direction: "inbound", content: buyPivotMsg }],
  { industry: "real_estate" },
  { isRealEstate: true },
);

assert(beforeBuy.score >= 75, `pre-pivot hot (got ${beforeBuy.score})`);
assert(afterBuy.score >= 80, `post buy-pivot hot (got ${afterBuy.score})`);
assert(afterBuy.score >= beforeBuy.score - 2, "score must not drop on buy pivot");
assert(
  afterBuy.signals.detected.includes("re:specific_buy_search"),
  "detects specific buy search",
);

const intel = analyzeConversation(
  [...susuThread, { direction: "inbound", content: buyPivotMsg }],
  { isRealEstate: true, crmLeadScore: 66 },
);
assert(intel.leadScoreDetails?.score != null && intel.leadScoreDetails.score >= 80, "display merges up from stale CRM 66");
assert(intel.intent === "Buyer", `intent Buyer after pivot (got ${intel.intent})`);

const buyOnly = scoreLead([{ direction: "inbound", content: buyPivotMsg }], { industry: "real_estate" }, { isRealEstate: true });
assert(buyOnly.score >= 80, `single buy search message hot (got ${buyOnly.score})`);

console.log("lead-score-pivot.test.ts: OK");
