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
import {
  hasGenuineConversationActivity,
  MIN_HOT_TAG_SCORE,
} from "./leadQualification";
import { resolveAiRouting, type AiRoutingDecision } from "./aiRouting";
import { resolveCopilotDominantIntent } from "./copilotIntent";
import type { SellerIntentClass } from "./sellerIntent";
import { isPureSellerIntent } from "./sellerIntent";

export type CustomerInsightContext = {
  reasons?: string[];
  intent?: string;
  bucket?: string;
  viewingIntent?: boolean;
  signals?: unknown;
  missingRequiredCount?: number;
  score?: number;
  mediaOnly?: boolean;
  inboundCount?: number;
  conversationTurns?: number;
  inboundText?: string;
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
  const bucket = ctx.bucket ?? "";
  const score = ctx.score ?? 0;
  const mediaOnly = ctx.mediaOnly === true;
  const activityStats = {
    inbound: ctx.inboundCount ?? 0,
    outbound: 0,
    turns: ctx.conversationTurns ?? 0,
  };
  const genuineActivity =
    !mediaOnly &&
    bucket !== "unqualified" &&
    hasGenuineConversationActivity(activityStats, ctx.inboundText ?? "");

  const items: InsightCandidate[] = [];
  const rawReasons = ctx.reasons ?? [];
  for (const reason of rawReasons) {
    const human = humanizeScoringReason(reason);
    if (!human) continue;
    const mapped = REASON_INSIGHTS[human];
    if (!mapped) continue;
    if (mapped.group === "engagement" && !genuineActivity) continue;
    items.push(mapped);
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
    (bucket === "hot" || bucket === "warm") &&
    score >= MIN_HOT_TAG_SCORE &&
    !mediaOnly &&
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
  inboundText?: string;
  showingTimingPhrase?: string | null;
  mentionedDeposit?: boolean;
  schedulingLinkSent?: boolean;
  /** Platform routing decision — aligns Copilot with AI auto-reply routing */
  aiRoutingDecision?: AiRoutingDecision;
  needsRoutingClarification?: boolean;
  /** Count of active preset campaigns this contact can enroll in from the current channel */
  enrollableCampaignCount?: number;
  /** Seller Lead Engine — intent class from latest inbound */
  sellerIntent?: SellerIntentClass | null;
  /** Latest inbound line — preferred for dominant intent when set */
  latestInboundText?: string;
};

type ActionCandidate = { label: string; rank: number; group: string };

function collectBuyerInventoryActions(ctx: ContextualActionContext): ActionCandidate[] {
  const timing = ctx.showingTimingPhrase?.trim();
  const actions: ActionCandidate[] = [
    { label: "Share matching listings", rank: 98, group: "buyer_inventory" },
  ];

  if (ctx.hasShowingIntent) {
    actions.push({
      label: timing ? `Confirm ${timing} availability` : "Confirm showing availability",
      rank: 100,
      group: "showing",
    });
    actions.push({ label: "Schedule showing", rank: 94, group: "showing" });
  } else {
    actions.push({ label: "Schedule showing", rank: 92, group: "showing" });
  }

  actions.push({ label: "Send more matches", rank: 86, group: "buyer_inventory" });
  return actions;
}

function collectContextualActionCandidates(ctx: ContextualActionContext): ActionCandidate[] {
  const actions: ActionCandidate[] = [];
  const timing = ctx.showingTimingPhrase?.trim();
  const sellerIntent = ctx.sellerIntent ?? null;
  const intentText = ctx.latestInboundText ?? ctx.inboundText;
  const dominantIntent = resolveCopilotDominantIntent({
    inboundText: intentText,
    sellerIntent,
  });

  if (dominantIntent === "seller") {
    if (sellerIntent === "seller_valuation") {
      actions.push({ label: "Request CMA Information", rank: 97, group: "seller_cma" });
      actions.push({ label: "Request Property Address", rank: 95, group: "seller_address" });
    } else if (sellerIntent === "seller_listing_consultation" || sellerIntent === "seller_new") {
      actions.push({ label: "Book Listing Consultation", rank: 98, group: "seller_consult" });
      actions.push({ label: "Request Property Address", rank: 94, group: "seller_address" });
    } else {
      actions.push({ label: "Book Listing Consultation", rank: 92, group: "seller_consult" });
    }
    actions.push({ label: "Assign Listing Agent", rank: 88, group: "seller_assign" });
    actions.push({ label: "Follow Up", rank: 50, group: "seller_followup" });
    return dedupeActionCandidates(actions).slice(0, 3);
  }

  if (dominantIntent === "mixed") {
    actions.push({ label: "Book Listing Consultation", rank: 90, group: "seller_consult" });
    actions.push({ label: "Request Property Address", rank: 86, group: "seller_address" });
  }

  if (dominantIntent === "buyer") {
    actions.push(...collectBuyerInventoryActions(ctx));
  }

  const routing =
    ctx.inboundText?.trim()
      ? resolveAiRouting({ inbound: ctx.inboundText, joinedInbound: ctx.inboundText })
      : null;
  const routingDecision = ctx.aiRoutingDecision ?? routing?.decision;
  const needsClarify =
    ctx.needsRoutingClarification ?? routing?.needsRoutingClarification ?? false;
  const infoSeeking = routing?.signals.includes("info_seeking") ?? false;

  if (needsClarify) {
    actions.push({
      label: "Clarify chat vs schedule",
      rank: 93,
      group: "contact",
    });
  } else if (routingDecision === "ASSIGN_AGENT" && !ctx.assignedTo) {
    actions.push({ label: "Assign agent", rank: 96, group: "assign" });
  } else if (routingDecision === "START_NURTURE") {
    if ((ctx.enrollableCampaignCount ?? 0) > 0) {
      actions.push({ label: "Enroll in nurture campaign", rank: 54, group: "campaign" });
    } else {
      actions.push({ label: "Send nurture follow-up", rank: 52, group: "followup" });
    }
  } else if (infoSeeking) {
    actions.push({ label: "Ask qualifying question", rank: 84, group: "contact" });
  }

  const allowBookingActions =
    routingDecision === "BOOK_APPOINTMENT" ||
    (!routingDecision && ctx.hasShowingIntent) ||
    (routingDecision === "CONTINUE_AI" && ctx.hasShowingIntent && !needsClarify);

  if (allowBookingActions && ctx.hasShowingIntent) {
    actions.push({
      label: timing ? `Confirm ${timing} availability` : "Confirm showing availability",
      rank: 100,
      group: "showing",
    });
    if (!ctx.schedulingLinkSent) {
      actions.push({
        label: "Send available time options",
        rank: 94,
        group: "showing_times",
      });
    }
  }

  if (ctx.hasFinancingDiscussion || ctx.mentionedDeposit) {
    actions.push({
      label: "Ask if financing is already arranged",
      rank: 88,
      group: "financing",
    });
  } else if (
    ctx.hasStrongPurchaseIntent &&
    !ctx.hasShowingIntent &&
    routingDecision !== "ASSIGN_AGENT" &&
    !needsClarify
  ) {
    actions.push({ label: "Contact customer", rank: 82, group: "contact" });
    if (allowBookingActions) {
      actions.push({ label: "Schedule appointment", rank: 78, group: "showing" });
    }
  } else if (ctx.leadLabel === "Hot" || ctx.bucket === "hot") {
    if (!actions.some((a) => a.group === "contact")) {
      actions.push({ label: "Contact customer", rank: 80, group: "contact" });
    }
  } else if (
    ctx.leadLabel === "Cold" ||
    ctx.bucket === "cold" ||
    ctx.bucket === "unqualified"
  ) {
    if ((ctx.enrollableCampaignCount ?? 0) > 0) {
      actions.push({ label: "Enroll in nurture campaign", rank: 42, group: "campaign" });
    } else {
      actions.push({ label: "Send nurture follow-up", rank: 40, group: "followup" });
    }
  }

  const hasHighValueAction = actions.some((a) => a.rank >= 75);
  const shouldSuggestFollowUp =
    (ctx.lastOutbound && !ctx.hasFollowUp) ||
    (ctx.hasDelayLater && !ctx.aiPaused && hasHighValueAction);

  if (shouldSuggestFollowUp && !actions.some((a) => a.group === "followup")) {
    actions.push({
      label: "Follow up if no response",
      rank: 48,
      group: "followup",
    });
  }

  const lowConfidence = (ctx.confidence ?? 1) < 0.45;
  if (actions.length === 0 && lowConfidence) {
    if (!ctx.assignedTo) actions.push({ label: "Assign agent", rank: 20, group: "assign" });
    actions.push({ label: "Set follow-up", rank: 15, group: "followup" });
  }

  return actions;
}

function dedupeActionCandidates(candidates: ActionCandidate[]): ActionCandidate[] {
  const byGroup = new Map<string, ActionCandidate>();
  for (const c of candidates) {
    const prev = byGroup.get(c.group);
    if (!prev || c.rank > prev.rank) byGroup.set(c.group, c);
  }
  return Array.from(byGroup.values())
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 3);
}

export type NextBestActionBehavior = "book" | "follow" | "assign" | "snooze" | "composer" | "campaign";

export type ContextualNextAction = {
  label: string;
  behavior: NextBestActionBehavior;
};

/** Map internal action group → UI surface (intent-based, not label text). */
export function behaviorForActionGroup(group: string): NextBestActionBehavior {
  switch (group) {
    case "showing":
    case "seller_consult":
      return "book";
    case "followup":
    case "seller_followup":
      return "follow";
    case "campaign":
      return "campaign";
    case "assign":
      return "assign";
    case "showing_times":
    case "financing":
    case "contact":
    case "seller_cma":
    case "seller_address":
    case "seller_assign":
    case "buyer_inventory":
      return "composer";
    default:
      return "composer";
  }
}

export function buildContextualNextActions(ctx: ContextualActionContext): ContextualNextAction[] {
  if (ctx.handoffActive) {
    return [
      { label: "Assign agent", behavior: "assign" as const },
      { label: "Reply personally", behavior: "composer" as const },
    ].slice(0, 3);
  }

  return dedupeActionCandidates(collectContextualActionCandidates(ctx)).map((c) => ({
    label: c.label,
    behavior: behaviorForActionGroup(c.group) as ContextualNextAction["behavior"],
  }));
}

export function buildContextualNextActionLabels(ctx: ContextualActionContext): string[] {
  return buildContextualNextActions(ctx).map((a) => a.label);
}

export { FINANCING_GUIDANCE_SUGGESTION };

/** Label-only fallback when behavior is not embedded (e.g. legacy labels). */
export function getNextBestActionBehavior(label: string): NextBestActionBehavior {
  const l = label.toLowerCase();

  if (/\b(snooze|pause autopilot|pause ai)\b/.test(l)) {
    return "snooze";
  }

  if (/\b(clarify chat vs schedule|clarify human vs schedule)\b/.test(l)) {
    return "composer";
  }

  if (/\bassign agent\b/.test(l)) {
    return "assign";
  }

  if (
    /\b(follow up if|follow-up|set follow-up|set follow up|remind later|no response|nurture|send nurture)\b/.test(
      l,
    )
  ) {
    return "follow";
  }

  if (
    /\b(confirm .+ availability|confirm availability|showing availability|schedule appointment|schedule a showing|book appointment|book a (showing|meeting)|book meeting|viewing|showing)\b/.test(
      l,
    )
  ) {
    return "book";
  }

  return "composer";
}

export const SCHEDULING_COMPOSER_INTRO = "Here are a few times that work on my end:";

/** Copilot / manual "Send available time options" — needs server-resolved scheduling URL. */
export function isSchedulingComposerAction(label: string): boolean {
  const l = label.toLowerCase();
  return /time options|available time/.test(l);
}

/** Composer draft for scheduling actions once the public booking URL is resolved. */
export function buildSchedulingComposerDraft(schedulingUrl: string): string {
  const url = schedulingUrl.trim();
  if (!url) return SCHEDULING_COMPOSER_INTRO;
  return `${SCHEDULING_COMPOSER_INTRO}\n${url}`;
}

/** Draft text for composer-only actions (never used for tool actions). */
export function composerSuggestionForAction(label: string): string {
  const l = label.toLowerCase();
  if (isSchedulingComposerAction(label)) {
    return SCHEDULING_COMPOSER_INTRO;
  }
  if (/financing|lender/.test(l)) {
    return "Are you already working with a lender, or would you like me to connect you with one?";
  }
  if (/clarify chat vs schedule|clarify human vs schedule/.test(l)) {
    return "Happy to help — are you looking to chat with someone now about a specific question, or would you prefer to schedule a call?";
  }
  if (/reply personally/.test(l)) {
    return "Hi! I wanted to follow up on our conversation personally.";
  }
  if (/contact customer/.test(l)) {
    return "Hi! I wanted to follow up on our conversation.";
  }
  return label;
}

const SHOWING_TIMING_RE =
  /\b(next week|this week|next month|tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;

export function extractShowingTimingPhrase(inboundText: string): string | null {
  const m = SHOWING_TIMING_RE.exec(inboundText);
  if (!m) return null;
  return m[1].toLowerCase();
}

export type CustomerSummaryContext = {
  memoryParagraph?: string;
  inboundText?: string;
  budget?: string | null;
  timeline?: string | null;
  financing?: string | null;
  intent?: string;
  viewingIntent?: boolean;
  /** When Buyer Preferences panel already shows structured criteria, omit duplicate summary lines. */
  suppressCriteriaBullets?: boolean;
};

function cleanSummaryBullet(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\.$/, "")
    .trim();
}

function isCriteriaSummaryBullet(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    /^budget\b/i.test(lower) ||
    /\btimeline\b/i.test(lower) ||
    /\bfinancing\b/i.test(lower) ||
    /\bpre-?approved\b/i.test(lower) ||
    /\$\d/.test(lower)
  );
}

function paragraphToBullets(paragraph: string, suppressCriteria = false): string[] {
  const chunks = paragraph
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => cleanSummaryBullet(s))
    .filter((s) => s.length > 8);
  const out: string[] = [];
  for (const chunk of chunks) {
    if (!chunk) continue;
    const lower = chunk.toLowerCase();
    if (suppressCriteria && isCriteriaSummaryBullet(chunk)) continue;
    if (/budget around/i.test(lower)) out.push(chunk.replace(/^budget around/i, "Budget around"));
    else if (/timeline:/i.test(lower)) out.push(chunk.replace(/^timeline:\s*/i, "Timeline: "));
    else if (/financing:/i.test(lower)) out.push(chunk.replace(/^financing:\s*/i, "Financing: "));
    else out.push(chunk.charAt(0).toUpperCase() + chunk.slice(1));
    if (out.length >= 2) break;
  }
  return out;
}

/** Compact Customer Summary bullets for sidebar (2+ facts → bullets). */
export function buildCustomerSummaryBullets(ctx: CustomerSummaryContext): string[] {
  const inbound = (ctx.inboundText ?? "").toLowerCase();
  const bullets: string[] = [];
  const seen = new Set<string>();

  const add = (text: string) => {
    const b = cleanSummaryBullet(text);
    if (!b || seen.has(b.toLowerCase())) return;
    seen.add(b.toLowerCase());
    bullets.push(b);
  };

  const showingTiming = extractShowingTimingPhrase(inbound);
  const wantsShowing =
    ctx.viewingIntent ||
    ctx.intent === "Booking" ||
    /\b(showing|tour|viewing|see the (house|property|place)|schedule|appointment|availability)\b/i.test(
      inbound,
    );

  if (wantsShowing) {
    add(showingTiming ? `Wants a showing ${showingTiming}` : "Wants to schedule a showing");
  }

  if (/\b(ready to move|move forward|ready to proceed)\b/i.test(inbound)) {
    add("Ready to move forward");
  }

  if (/\b(deposit|earnest money|down payment)\b/i.test(inbound)) {
    add("Mentioned deposit");
  }

  if (!ctx.suppressCriteriaBullets) {
    if (ctx.budget) add(`Budget around ${ctx.budget}`);
    if (ctx.timeline) add(`Timeline: ${ctx.timeline}`);
    if (ctx.financing) add(`Financing: ${ctx.financing}`);
  }

  if (bullets.length >= 2) return bullets.slice(0, 2);

  const fromMemory = ctx.memoryParagraph
    ? paragraphToBullets(ctx.memoryParagraph, !!ctx.suppressCriteriaBullets)
    : [];
  if (fromMemory.length >= 2) return fromMemory.slice(0, 2);
  if (bullets.length === 1 && fromMemory.length === 1) return [bullets[0], fromMemory[0]];
  if (bullets.length === 1) return bullets;
  if (fromMemory.length >= 1) return fromMemory.slice(0, 2);

  const fallback = cleanSummaryBullet(ctx.memoryParagraph ?? "");
  if (fallback && ctx.suppressCriteriaBullets && isCriteriaSummaryBullet(fallback)) return bullets;
  return fallback ? [fallback] : bullets;
}
