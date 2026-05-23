/**
 * Customer-facing insights & next actions — deduplicated, action-oriented.
 * Principle: AI explains the customer, not itself.
 */

import {
  FINANCING_GUIDANCE_SUGGESTION,
  humanizeScoringReason,
  hasFinancingDiscussionFromSignals,
  hasShowingInterestFromSignals,
} from "./customerBehaviorCopy";

export type CustomerInsightContext = {
  reasons?: string[];
  intent?: string;
  bucket?: string;
  viewingIntent?: boolean;
  signals?: unknown;
  missingRequiredCount?: number;
};

type InsightCandidate = { group: string; rank: number; bullet: string };

const REASON_INSIGHTS: Record<string, InsightCandidate> = {
  "Customer appears ready to move forward": {
    group: "ready",
    rank: 92,
    bullet: "Ready to move forward",
  },
  "Customer asked about pricing and buying": {
    group: "purchase",
    rank: 88,
    bullet: "Strong purchase intent",
  },
  "Customer is highly engaged": {
    group: "engagement",
    rank: 38,
    bullet: "Actively engaging in conversation",
  },
  "Customer is engaged": {
    group: "engagement",
    rank: 32,
    bullet: "Actively engaging in conversation",
  },
  "Customer is exploring options": {
    group: "engagement",
    rank: 28,
    bullet: "Exploring options",
  },
  "Customer seems time-sensitive": {
    group: "urgency",
    rank: 70,
    bullet: "Time-sensitive request",
  },
  "Customer shared property-related details": {
    group: "property",
    rank: 45,
    bullet: "Shared property preferences",
  },
  "Customer shared rental-related details": {
    group: "property",
    rank: 45,
    bullet: "Shared rental preferences",
  },
  "A few details are still missing": {
    group: "missing",
    rank: 18,
    bullet: "A few details still missing",
  },
};

export function buildCustomerInsights(ctx: CustomerInsightContext): string[] {
  const items: InsightCandidate[] = [];
  const rawReasons = ctx.reasons ?? [];
  for (const reason of rawReasons) {
    const human = humanizeScoringReason(reason);
    if (!human) continue;
    const mapped = REASON_INSIGHTS[human];
    if (mapped) items.push(mapped);
  }

  const showing =
    ctx.viewingIntent ||
    ctx.intent === "Booking" ||
    hasShowingInterestFromSignals(ctx.signals);
  if (showing) {
    items.push({
      group: "showing",
      rank: 90,
      bullet: "Interested in scheduling a showing",
    });
  }

  if (hasFinancingDiscussionFromSignals(ctx.signals)) {
    items.push({ group: "financing", rank: 76, bullet: "Asked about financing" });
  }

  if ((ctx.missingRequiredCount ?? 0) > 0 && !items.some((i) => i.group === "missing")) {
    items.push({
      group: "missing",
      rank: 18,
      bullet: "A few details still missing",
    });
  }

  if (
    items.length === 0 &&
    (ctx.bucket === "hot" || ctx.bucket === "warm") &&
    ctx.intent &&
    ctx.intent !== "Browsing"
  ) {
    items.push({ group: "interest", rank: 42, bullet: "Showing strong interest" });
  }

  const byGroup = new Map<string, InsightCandidate>();
  for (const item of items) {
    const prev = byGroup.get(item.group);
    if (!prev || item.rank > prev.rank) byGroup.set(item.group, item);
  }

  let grouped = Array.from(byGroup.values());
  const hasPriorityStory = grouped.some((g) =>
    ["ready", "showing", "purchase", "financing", "urgency"].includes(g.group),
  );
  if (hasPriorityStory) {
    grouped = grouped.filter((g) => g.group !== "engagement" && g.group !== "interest");
  }

  return grouped
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 3)
    .map((i) => i.bullet);
}

export type ContextualActionContext = {
  handoffActive?: boolean;
  hasShowingIntent?: boolean;
  hasFinancingDiscussion?: boolean;
  hasStrongPurchaseIntent?: boolean;
  bucket?: string;
  leadLabel?: string;
  lastDirection?: "inbound" | "outbound" | null;
  hasFollowUp?: boolean;
  assignedTo?: string | null;
  confidence?: number;
  aiPaused?: boolean;
  hasDelayLater?: boolean;
  lastOutbound?: boolean;
};

type ActionCandidate = { label: string; rank: number };

export function buildContextualNextActionLabels(ctx: ContextualActionContext): string[] {
  if (ctx.handoffActive) {
    return ["Assign agent", "Reply personally"].slice(0, 3);
  }

  const actions: ActionCandidate[] = [];

  if (ctx.hasShowingIntent) {
    actions.push({ label: "Confirm showing availability", rank: 100 });
    actions.push({ label: "Send available time options", rank: 95 });
    actions.push({ label: "Follow up if no response", rank: 55 });
  } else if (ctx.hasFinancingDiscussion) {
    actions.push({ label: "Ask if customer already has a lender", rank: 90 });
    actions.push({ label: "Offer lender recommendation", rank: 85 });
  } else if (ctx.leadLabel === "Hot" || ctx.bucket === "hot") {
    actions.push({ label: "Contact customer", rank: 82 });
    actions.push({ label: "Schedule appointment", rank: 78 });
  } else if (
    ctx.leadLabel === "Cold" ||
    ctx.bucket === "cold" ||
    ctx.bucket === "unqualified"
  ) {
    actions.push({ label: "Send nurture follow-up", rank: 40 });
  }

  if (ctx.lastOutbound && !ctx.hasFollowUp && !ctx.hasShowingIntent) {
    actions.push({ label: "Follow up if no response", rank: 52 });
  }

  if (ctx.hasDelayLater && !ctx.aiPaused) {
    actions.push({ label: "Follow up later", rank: 35 });
  }

  const lowConfidence = (ctx.confidence ?? 1) < 0.45;
  if (actions.length === 0 && lowConfidence) {
    if (!ctx.assignedTo) actions.push({ label: "Assign agent", rank: 20 });
    actions.push({ label: "Set follow-up", rank: 15 });
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of actions.sort((x, y) => y.rank - x.rank)) {
    if (seen.has(a.label)) continue;
    seen.add(a.label);
    out.push(a.label);
    if (out.length >= 3) break;
  }
  return out;
}

export { FINANCING_GUIDANCE_SUGGESTION };
