/**
 * Prospect AI Review UX — client-facing lifecycle labels & progress copy.
 * Presentation only; does not change backend pipeline statuses.
 */

import {
  hasTraceableProspectCampaignHistory,
  hasTraceableProspectInboxThread,
  hasTraceableProspectOutreachSend,
} from "./prospectTraceableOutreach";

export const PROSPECT_REVIEW_LIFECYCLE = [
  "imported",
  "analyzing",
  "ready_for_approval",
  "website_intelligence",
  "campaign_ready",
  "queued",
  "campaign",
  "inbox",
  "won",
] as const;

export type ProspectReviewLifecycle = (typeof PROSPECT_REVIEW_LIFECYCLE)[number];

export const PROSPECT_REVIEW_LIFECYCLE_LABELS: Record<ProspectReviewLifecycle, string> = {
  imported: "Imported",
  analyzing: "Analyzing…",
  ready_for_approval: "Ready for Approval",
  website_intelligence: "Enriched",
  campaign_ready: "Campaign Ready",
  queued: "Campaign Queue",
  campaign: "Campaign",
  inbox: "Inbox",
  won: "Won",
};

/** User-facing lifecycle navigation (primary chips). */
export type ProspectReviewNavFilter =
  | "all"
  | "review"
  | "website_intelligence"
  | "campaigns"
  | "inbox"
  | "won";

/** Optional Campaigns sub-filter (internal states; not primary chips). */
export type ProspectCampaignsSubFilter = "all" | "ready" | "queued" | "sending" | "completed";

/** Top filter chips — business progress, not internal pipeline states. */
export const PROSPECT_REVIEW_FILTER_CHIPS: Array<{
  id: ProspectReviewNavFilter;
  label: string;
}> = [
  { id: "all", label: "All" },
  { id: "review", label: "Review" },
  { id: "website_intelligence", label: "Enriched" },
  { id: "campaigns", label: "Campaigns" },
  { id: "inbox", label: "Inbox" },
  { id: "won", label: "Won" },
];

/** Filter group: Review lane before human approve. */
export const PROSPECT_REVIEW_LANE: ProspectReviewLifecycle[] = [
  "imported",
  "analyzing",
  "ready_for_approval",
];

/**
 * Campaigns nav lane — aggregates internal campaign_ready / queued / campaign.
 * Those statuses stay internal; they are not primary chips.
 */
export const PROSPECT_CAMPAIGNS_LANE: ProspectReviewLifecycle[] = [
  "campaign_ready",
  "queued",
  "campaign",
];

export const PROSPECT_CAMPAIGNS_SUB_FILTERS: Array<{
  id: ProspectCampaignsSubFilter;
  label: string;
}> = [
  { id: "all", label: "All" },
  { id: "ready", label: "Ready" },
  { id: "queued", label: "Queued" },
  { id: "sending", label: "Sending" },
  { id: "completed", label: "Sent" },
];

/**
 * Compact row timeline (primary visual status).
 * Imported is intentionally omitted — presence in the list already implies import.
 * Enriched = Website Intelligence completed (not merely “has a URL”).
 * Campaign = queued / enrolled / sent — not Campaign Ready alone.
 */
export const PROSPECT_TIMELINE_STAGES = [
  { id: "ai_review", label: "AI Review" },
  { id: "enriched", label: "Enriched" },
  { id: "campaign", label: "Campaign" },
] as const;

export type ProspectTimelineStageId = (typeof PROSPECT_TIMELINE_STAGES)[number]["id"];

export type ProspectTimelineStageState = "done" | "current" | "todo" | "failed";

export type ProspectReviewUxInput = {
  analysisStatus?: string | null;
  reviewStatus?: string | null;
  needsReview?: boolean | null;
  enrichmentStatus?: string | null;
  outreachStatus?: string | null;
  outreachSentAt?: string | Date | null;
  repliedAt?: string | Date | null;
  outreachMessageId?: string | null;
  outreachConversationId?: string | null;
  queueStatus?: string | null;
  outcome?: string | null;
  /** Server-confirmed outbound on a linked thread (optional). */
  hasOutboundMessage?: boolean | null;
  hasInboxThread?: boolean | null;
  /**
   * Server-derived prior outreach (same detectPriorProspectOutreach path as Send preview).
   * True when a real outbound / queue send / linked message exists — not stale PI flags alone.
   */
  priorOutreachDetected?: boolean | null;
  /** Last qualification failure reason (analysisStatus=failed). */
  errorMessage?: string | null;
};

/** Website Intelligence finished successfully (not URL presence). */
export function isProspectEnrichmentComplete(
  enrichmentStatus?: string | null,
): boolean {
  return String(enrichmentStatus || "").toLowerCase() === "completed";
}

export function isProspectEnrichmentFailed(
  enrichmentStatus?: string | null,
): boolean {
  return String(enrichmentStatus || "").toLowerCase() === "failed";
}

export function isProspectEnrichmentInProgress(
  enrichmentStatus?: string | null,
): boolean {
  const e = String(enrichmentStatus || "none").toLowerCase();
  return e === "pending" || e === "enriching";
}

/** Queued / enrolled in Campaigns — queue row OR traceable historical send. */
export function isProspectCampaignEnrolled(input: ProspectReviewUxInput): boolean {
  return hasTraceableProspectCampaignHistory(input);
}

/** True when AI qualification finished and row summary fields may be shown. */
export function isProspectQualificationComplete(
  analysisStatus?: string | null,
): boolean {
  const a = String(analysisStatus || "").toLowerCase();
  return a === "completed" || a === "needs_review";
}

/** True while qualification has not produced a usable result yet. */
export function isProspectQualificationPending(
  analysisStatus?: string | null,
): boolean {
  const a = String(analysisStatus || "pending").toLowerCase();
  return a === "pending" || a === "processing";
}

export type ProspectRowAiSummary = {
  showSummary: boolean;
  matchLabel: string;
  matchStars: number;
  priority?: string | null;
  businessType?: string | null;
  offerLabel?: string | null;
  angle?: string | null;
};

/**
 * Normalized AI Review table summary from saved qualification fields only.
 * Do not invent a second AI summary.
 */
export function buildProspectRowAiSummary(input: {
  analysisStatus?: string | null;
  leadScore?: number | null;
  priority?: string | null;
  businessType?: string | null;
  recommendedOffer?: string | null;
  suggestedOutreachAngle?: string | null;
  reasoningSummary?: string | null;
}): ProspectRowAiSummary {
  if (!isProspectQualificationComplete(input.analysisStatus)) {
    return {
      showSummary: false,
      matchLabel: "",
      matchStars: 0,
    };
  }
  const offerRaw = String(input.recommendedOffer || "").trim().toLowerCase();
  const notAFit = offerRaw === "not_a_fit";
  // Never show Excellent/Strong Match alongside not_a_fit (safety net for legacy rows).
  const match = notAFit
    ? { stars: 1, label: "Not a fit" }
    : prospectMatchSummary(input.leadScore);
  const offer = String(input.recommendedOffer || "")
    .trim()
    .replace(/_/g, " ");
  const angle =
    String(input.suggestedOutreachAngle || "").trim() ||
    String(input.reasoningSummary || "").trim() ||
    null;
  const businessType = String(input.businessType || "").trim() || null;
  return {
    showSummary: true,
    matchLabel: match.label || "AI Review complete",
    matchStars: match.stars,
    priority: notAFit ? "low" : input.priority ?? null,
    businessType,
    offerLabel: offer || null,
    // Successful AI Review always shows a summary line — never leave the cell blank.
    angle: (angle || "AI Review complete — open for details.").slice(0, 140),
  };
}

export function resolveProspectReviewLifecycle(
  input: ProspectReviewUxInput,
): ProspectReviewLifecycle {
  const outcome = String(input.outcome || "").toLowerCase();
  if (outcome === "won") return "won";

  // Inbox only with a real conversation/thread — not stale outreach_sent alone.
  if (hasTraceableProspectInboxThread(input)) {
    const outreach = String(input.outreachStatus || "not_sent").toLowerCase();
    if (outreach === "replied" || input.repliedAt) return "inbox";
    if (hasTraceableProspectOutreachSend(input)) return "inbox";
  }

  const queue = String(input.queueStatus || "").toLowerCase();
  if (queue === "sending") return "campaign";
  if (queue === "queued" || queue === "paused") return "queued";
  // Historical Inbox send (no queue) still counts as past the Review lane
  if (hasTraceableProspectOutreachSend(input) && !queue) return "inbox";

  const analysis = String(input.analysisStatus || "pending").toLowerCase();
  if (analysis === "processing") return "analyzing";
  if (analysis === "pending" || analysis === "failed") return "imported";

  const review = String(input.reviewStatus || "pending").toLowerCase();
  const enrichment = String(input.enrichmentStatus || "none").toLowerCase();

  if (review === "approved") {
    if (isProspectEnrichmentComplete(enrichment)) return "campaign_ready";
    return "website_intelligence";
  }

  if (isProspectQualificationComplete(analysis)) {
    return "ready_for_approval";
  }

  return "imported";
}

/**
 * Map review UX input → 3-step row timeline.
 * AI Review · Enriched · Campaign
 *
 * Campaign Ready never marks Campaign active/complete.
 * Website URL alone never marks Enriched complete.
 */
export function resolveProspectTimelineStates(
  input: ProspectReviewUxInput,
): ProspectTimelineStageState[] {
  const enrichment = String(input.enrichmentStatus || "none").toLowerCase();
  const life = resolveProspectReviewLifecycle(input);

  let aiReview: ProspectTimelineStageState;
  const analysisStatus = String(input.analysisStatus || "pending").toLowerCase();
  if (analysisStatus === "failed") {
    aiReview = "failed";
  } else if (isProspectQualificationComplete(input.analysisStatus)) {
    aiReview = "done";
  } else if (life === "analyzing" || life === "imported") {
    aiReview = "current";
  } else {
    aiReview = "todo";
  }

  let campaign: ProspectTimelineStageState;
  const queue = String(input.queueStatus || "").toLowerCase();
  // Campaign ✓ when queue history OR a traceable outbound send exists (findable history).
  if (hasTraceableProspectCampaignHistory(input)) {
    if (
      queue === "queued" ||
      queue === "paused" ||
      queue === "sending"
    ) {
      campaign = "current";
    } else {
      campaign = "done";
    }
  } else {
    campaign = "todo";
  }

  let enriched: ProspectTimelineStageState;
  if (isProspectEnrichmentFailed(enrichment)) {
    enriched = "failed";
  } else if (isProspectEnrichmentComplete(enrichment)) {
    enriched = "done";
  } else if (isProspectEnrichmentInProgress(enrichment)) {
    enriched = "current";
  } else if (
    // Legacy: reached Campaign/Inbox before Website Intelligence existed —
    // treat Enriched as done so the timeline does not look broken.
    campaign === "done" ||
    campaign === "current"
  ) {
    enriched = "done";
  } else {
    enriched = "todo";
  }

  return [aiReview, enriched, campaign];
}

export function matchesProspectReviewFilter(
  life: ProspectReviewLifecycle,
  filter: ProspectReviewNavFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "review") return PROSPECT_REVIEW_LANE.includes(life);
  if (filter === "campaigns") return PROSPECT_CAMPAIGNS_LANE.includes(life);
  if (filter === "website_intelligence") return life === "website_intelligence";
  if (filter === "inbox") return life === "inbox";
  if (filter === "won") return life === "won";
  return false;
}

/**
 * Narrow Campaigns lane by internal workflow state.
 * Sent (id `completed`) = outreach already sent — Campaigns history sub-filter only.
 */
export function matchesProspectCampaignsSubFilter(
  input: ProspectReviewUxInput,
  sub: ProspectCampaignsSubFilter,
): boolean {
  if (sub === "all") return true;
  const life = resolveProspectReviewLifecycle(input);
  const queue = String(input.queueStatus || "").toLowerCase();
  switch (sub) {
    case "ready":
      return life === "campaign_ready";
    case "queued":
      return life === "queued" || queue === "paused";
    case "sending":
      return life === "campaign" || queue === "sending";
    case "completed":
      return life === "inbox" || life === "won" || queue === "sent";
    default:
      return true;
  }
}

export function prospectReviewLifecycleLabel(status: ProspectReviewLifecycle | string): string {
  return (
    PROSPECT_REVIEW_LIFECYCLE_LABELS[status as ProspectReviewLifecycle] || String(status)
  );
}

export function prospectReviewEmptyMessage(
  filter: ProspectReviewNavFilter,
  hasAnyProspects: boolean,
): string {
  if (!hasAnyProspects) {
    return "No businesses yet. Discover prospects — AI qualifies them automatically.";
  }
  switch (filter) {
    case "review":
      return "No businesses waiting for review.";
    case "website_intelligence":
      return "No enriched prospects yet.";
    case "campaigns":
      return "No outreach campaigns yet.";
    case "inbox":
      return "No conversations yet.";
    case "won":
      return "No customers won yet.";
    case "all":
    default:
      return "Nothing to show for this filter.";
  }
}

/** Empty copy for Review work-state filters. */
export function prospectReviewWorkEmptyMessage(
  filter: string,
  hasAnyProspects: boolean,
): string {
  if (!hasAnyProspects) {
    return "No businesses yet. Discover prospects — AI qualifies them automatically.";
  }
  switch (filter) {
    case "needs_review":
      return "No prospects need review.";
    case "qualified":
      return "No qualified prospects ready for Campaigns.";
    case "not_qualified":
      return "No not-qualified prospects.";
    case "enriching":
      return "No prospects are being enriched.";
    case "needs_attention":
      return "Nothing needs attention.";
    case "all":
    default:
      return "Nothing to show for this filter.";
  }
}

export function prospectAiProgressMessage(
  kind: "analysis" | "enrichment",
  seed: string,
  tickSeconds = 0,
): string {
  // Kept for compatibility; prefer resolveAiPersonalityStatus for emoji + copy.
  const list =
    kind === "analysis"
      ? [
          "AI is reviewing this business…",
          "Matching it with AI Brain…",
          "Preparing an outreach angle…",
        ]
      : [
          "Analyzing the public website…",
          "Looking for public contact details…",
          "Preparing campaign recommendations…",
        ];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash + seed.charCodeAt(i) * (i + 1)) % 997;
  const idx = (hash + Math.floor(tickSeconds / 5)) % list.length;
  return list[idx];
}

export function prospectMatchSummary(score?: number | null): {
  stars: number;
  label: string;
} {
  const s = typeof score === "number" ? score : 0;
  if (s >= 85) return { stars: 5, label: "Excellent Match" };
  if (s >= 70) return { stars: 4, label: "Strong Match" };
  if (s >= 55) return { stars: 3, label: "Good Match" };
  if (s >= 40) return { stars: 2, label: "Fair Match" };
  return { stars: 1, label: "Possible Match" };
}

export function prospectReviewCompletionFlash(
  prev: ProspectReviewUxInput | null | undefined,
  next: ProspectReviewUxInput,
): string | null {
  if (!prev) return null;
  const prevLife = resolveProspectReviewLifecycle(prev);
  const nextLife = resolveProspectReviewLifecycle(next);
  if (
    (prevLife === "analyzing" || prevLife === "imported") &&
    nextLife === "ready_for_approval"
  ) {
    return "✓ AI Review complete";
  }
  if (prevLife === "website_intelligence" && nextLife === "campaign_ready") {
    return "✓ Enriched";
  }
  if (prevLife !== "campaign_ready" && nextLife === "campaign_ready") {
    return "✓ Campaign Ready";
  }
  const prevEnrich = String(prev.enrichmentStatus || "").toLowerCase();
  const nextEnrich = String(next.enrichmentStatus || "").toLowerCase();
  if (prevEnrich !== "completed" && nextEnrich === "completed") {
    return "✓ Enriched";
  }
  return null;
}

/**
 * Keep relative order of rows already on screen (avoid jumpiness mid-analyze).
 * Newly appeared contactIds are prepended so a fresh Send-to-Review batch
 * lands at the top of the work queue instead of the bottom.
 */
export function mergeProspectRowsStableOrder<T extends { contactId: string }>(
  previousOrder: string[],
  nextItems: T[],
): { order: string[]; items: T[] } {
  const byId = new Map(nextItems.map((i) => [i.contactId, i]));
  const order: string[] = [];
  const items: T[] = [];

  const known = new Set(previousOrder);
  // New rows first (discovery → Review batches).
  for (const row of nextItems) {
    if (!known.has(row.contactId) && byId.has(row.contactId)) {
      order.push(row.contactId);
      items.push(row);
      byId.delete(row.contactId);
    }
  }
  for (const id of previousOrder) {
    const row = byId.get(id);
    if (row) {
      order.push(id);
      items.push(row);
      byId.delete(id);
    }
  }
  // Any remaining (should be rare) keep server order at end.
  for (const row of nextItems) {
    if (byId.has(row.contactId)) {
      order.push(row.contactId);
      items.push(row);
      byId.delete(row.contactId);
    }
  }
  return { order, items };
}
