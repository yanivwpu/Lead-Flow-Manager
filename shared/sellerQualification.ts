/**
 * Seller qualification — one question at a time (Phase 1).
 */
import type { SellerPreferenceProfile } from "./sellerPreferenceSchema";
import type { SellerIntentClass } from "./sellerIntent";

const MIN_CONFIDENCE = 0.5;

function fieldActive<T>(
  f: { value?: T; confidence?: number } | undefined,
  min = MIN_CONFIDENCE,
): boolean {
  return !!f && typeof f.confidence === "number" && f.confidence >= min && f.value != null && f.value !== "";
}

export type SellerQualificationContext = {
  level: "low" | "medium" | "high";
  known: string[];
  missing: string[];
  suggestedQuestion: string;
  sellerIntent: SellerIntentClass | null;
  hasAddress: boolean;
  hasTimeline: boolean;
  hasReason: boolean;
  hasCondition: boolean;
};

export type SellerQualificationInput = {
  profile: SellerPreferenceProfile;
  inboundText?: string | null;
  sellerIntent?: SellerIntentClass | null;
};

const GAP_QUESTIONS: Record<string, string> = {
  propertyAddress:
    "What is the address of the property you're thinking of selling? Even a street or neighborhood helps us get started.",
  timeline:
    "What's your timeline for selling — are you hoping to move in the next 30 days, a few months, or just exploring options?",
  reasonForSelling:
    "What's prompting the move — upsizing, relocating, downsizing, or something else?",
  condition:
    "How would you describe the condition of the home — move-in ready, or does it need some work?",
  desiredPrice:
    "Do you have a price in mind, or would you like us to walk through a market analysis first?",
};

function pickGapQuestion(missing: string[]): string {
  const priority = ["propertyAddress", "timeline", "reasonForSelling", "condition", "desiredPrice"];
  for (const key of priority) {
    if (missing.includes(key)) return GAP_QUESTIONS[key];
  }
  return "Happy to help with your sale — what's the best next step for you, a quick call or a listing consultation?";
}

export function assessSellerQualification(input: SellerQualificationInput): SellerQualificationContext {
  const profile = input.profile;
  const known: string[] = [];
  const missing: string[] = [];

  const hasAddress = fieldActive(profile.propertyAddress) || fieldActive(profile.city);
  const hasTimeline = fieldActive(profile.timeline);
  const hasReason = fieldActive(profile.reasonForSelling);
  const hasCondition = fieldActive(profile.condition);
  const hasDesiredPrice = fieldActive(profile.desiredPrice);

  if (hasAddress) known.push("property location");
  else missing.push("propertyAddress");
  if (hasTimeline) known.push("timeline");
  else missing.push("timeline");
  if (hasReason) known.push("reason for selling");
  else missing.push("reasonForSelling");
  if (hasCondition) known.push("condition");
  else missing.push("condition");
  if (hasDesiredPrice) known.push("desired price");
  else missing.push("desiredPrice");

  let level: "low" | "medium" | "high" = "low";
  if (hasAddress && hasTimeline && hasReason) level = "high";
  else if (hasAddress || hasTimeline) level = "medium";

  const intent = input.sellerIntent ?? (profile.lastSellerIntent as SellerIntentClass | undefined) ?? null;
  let suggestedQuestion = pickGapQuestion(missing);

  if (intent === "seller_valuation" && !hasAddress) {
    suggestedQuestion = GAP_QUESTIONS.propertyAddress;
  } else if (intent === "seller_valuation" && hasAddress && !hasTimeline) {
    suggestedQuestion =
      "To prepare a market analysis, what's your timeline for selling?";
  } else if (intent === "seller_listing_consultation" && level === "high") {
    suggestedQuestion =
      "Sounds like we have a good picture — would you like to schedule a listing consultation?";
  }

  return {
    level,
    known,
    missing,
    suggestedQuestion,
    sellerIntent: intent,
    hasAddress,
    hasTimeline,
    hasReason,
    hasCondition,
  };
}

export function formatSellerQualificationContextForAi(ctx: SellerQualificationContext): string {
  const knownLine = ctx.known.length > 0 ? ctx.known.join(", ") : "not yet captured";
  return `Seller qualification assessment (SELLER PATH — do NOT run buyer inventory matching):
- Seller intent: ${ctx.sellerIntent || "seller"}
- Tier: ${ctx.level.toUpperCase()}
- Known: ${knownLine}
- Priority gaps: ${ctx.missing.slice(0, 4).join(", ") || "none"}
- Ask ONLY ONE question: "${ctx.suggestedQuestion}"
SELLER RULES:
- Do NOT recommend buyer listings, inventory cards, or home search results
- Do NOT ask buyer financing or pre-approval questions unless the lead also wants to buy
- Focus on listing consultation, CMA/valuation intake, or property details
- No automated pricing or CMA numbers in Phase 1 — offer consultation instead`;
}
