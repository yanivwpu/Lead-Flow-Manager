/**
 * Prospect AI Review UX — client-facing lifecycle labels & progress copy.
 * Presentation only; does not change backend pipeline statuses.
 */

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
  website_intelligence: "Website Intelligence",
  campaign_ready: "Campaign Ready",
  queued: "Campaign Queue",
  campaign: "Campaign",
  inbox: "Inbox",
  won: "Won",
};

/** Top filter chips — short premium labels with counts in UI. */
export const PROSPECT_REVIEW_FILTER_CHIPS: Array<{
  id: "all" | "review" | ProspectReviewLifecycle;
  label: string;
}> = [
  { id: "all", label: "All" },
  { id: "review", label: "Review" },
  { id: "website_intelligence", label: "Website" },
  { id: "campaign_ready", label: "Campaign Ready" },
  { id: "queued", label: "Campaign Queue" },
  { id: "campaign", label: "Campaign" },
  { id: "inbox", label: "Inbox" },
  { id: "won", label: "Won" },
];

/** Filter group: Review lane before human approve. */
export const PROSPECT_REVIEW_LANE: ProspectReviewLifecycle[] = [
  "imported",
  "analyzing",
  "ready_for_approval",
];

/** Compact row timeline (primary visual status). */
export const PROSPECT_TIMELINE_STAGES = [
  { id: "imported", label: "Imported" },
  { id: "ai_review", label: "AI Review" },
  { id: "website", label: "Website" },
  { id: "campaign", label: "Campaign" },
] as const;

export type ProspectTimelineStageState = "done" | "current" | "todo";

export type ProspectReviewUxInput = {
  analysisStatus?: string | null;
  reviewStatus?: string | null;
  needsReview?: boolean | null;
  enrichmentStatus?: string | null;
  outreachStatus?: string | null;
  outreachSentAt?: string | Date | null;
  repliedAt?: string | Date | null;
  queueStatus?: string | null;
  outcome?: string | null;
};

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
  const match = prospectMatchSummary(input.leadScore);
  const offer = String(input.recommendedOffer || "")
    .trim()
    .replace(/_/g, " ");
  const angle =
    String(input.suggestedOutreachAngle || "").trim() ||
    String(input.reasoningSummary || "").trim() ||
    null;
  return {
    showSummary: true,
    matchLabel: match.label,
    matchStars: match.stars,
    priority: input.priority ?? null,
    businessType: String(input.businessType || "").trim() || null,
    offerLabel: offer || null,
    angle: angle ? angle.slice(0, 220) : null,
  };
}

export function resolveProspectReviewLifecycle(
  input: ProspectReviewUxInput,
): ProspectReviewLifecycle {
  const outcome = String(input.outcome || "").toLowerCase();
  if (outcome === "won") return "won";

  const outreach = String(input.outreachStatus || "not_sent").toLowerCase();
  if (outreach === "replied" || outreach === "outreach_sent" || input.repliedAt || input.outreachSentAt) {
    return "inbox";
  }

  const queue = String(input.queueStatus || "").toLowerCase();
  if (queue === "sending") return "campaign";
  if (queue === "queued" || queue === "paused") return "queued";

  const analysis = String(input.analysisStatus || "pending").toLowerCase();
  if (analysis === "processing") return "analyzing";
  if (analysis === "pending" || analysis === "failed") return "imported";

  const review = String(input.reviewStatus || "pending").toLowerCase();
  const enrichment = String(input.enrichmentStatus || "none").toLowerCase();

  if (review === "approved") {
    if (enrichment === "pending" || enrichment === "enriching") return "website_intelligence";
    return "campaign_ready";
  }

  // Qualification finished (including AI "needs_review" outcomes) → Ready for Approval.
  if (isProspectQualificationComplete(analysis)) {
    return "ready_for_approval";
  }

  return "imported";
}

/** Map lifecycle → 4-step timeline states (presentation only). */
export function resolveProspectTimelineStates(
  life: ProspectReviewLifecycle,
): ProspectTimelineStageState[] {
  switch (life) {
    case "imported":
      return ["current", "todo", "todo", "todo"];
    case "analyzing":
      return ["done", "current", "todo", "todo"];
    case "ready_for_approval":
      return ["done", "done", "todo", "todo"];
    case "website_intelligence":
      return ["done", "done", "current", "todo"];
    case "campaign_ready":
      return ["done", "done", "done", "current"];
    case "queued":
    case "campaign":
    case "inbox":
    case "won":
      return ["done", "done", "done", "done"];
    default:
      return ["todo", "todo", "todo", "todo"];
  }
}

export function matchesProspectReviewFilter(
  life: ProspectReviewLifecycle,
  filter: "all" | "review" | ProspectReviewLifecycle,
): boolean {
  if (filter === "all") return true;
  if (filter === "review") return PROSPECT_REVIEW_LANE.includes(life);
  return life === filter;
}

export function prospectReviewLifecycleLabel(status: ProspectReviewLifecycle | string): string {
  return (
    PROSPECT_REVIEW_LIFECYCLE_LABELS[status as ProspectReviewLifecycle] || String(status)
  );
}

export function prospectReviewEmptyMessage(
  filter: "all" | "review" | ProspectReviewLifecycle,
  hasAnyProspects: boolean,
): string {
  if (!hasAnyProspects) {
    return "No businesses yet. Discover prospects — AI qualifies them automatically.";
  }
  switch (filter) {
    case "review":
      return "No businesses waiting for review.";
    case "website_intelligence":
      return "Website Intelligence completed.";
    case "campaign_ready":
      return "Everything is campaign ready.";
    case "queued":
      return "Nothing in the queue right now.";
    case "campaign":
      return "No active campaign sends.";
    case "inbox":
      return "No outreach in Inbox yet.";
    case "won":
      return "No won customers yet.";
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
    return "✓ Website ready";
  }
  if (prevLife !== "campaign_ready" && nextLife === "campaign_ready") {
    return "✓ Campaign Ready";
  }
  const prevEnrich = String(prev.enrichmentStatus || "").toLowerCase();
  const nextEnrich = String(next.enrichmentStatus || "").toLowerCase();
  if (prevEnrich !== "completed" && nextEnrich === "completed") {
    return "✓ Website ready";
  }
  return null;
}

export function mergeProspectRowsStableOrder<T extends { contactId: string }>(
  previousOrder: string[],
  nextItems: T[],
): { order: string[]; items: T[] } {
  const byId = new Map(nextItems.map((i) => [i.contactId, i]));
  const order: string[] = [];
  const items: T[] = [];

  for (const id of previousOrder) {
    const row = byId.get(id);
    if (row) {
      order.push(id);
      items.push(row);
      byId.delete(id);
    }
  }
  for (const row of nextItems) {
    if (byId.has(row.contactId)) {
      order.push(row.contactId);
      items.push(row);
      byId.delete(row.contactId);
    }
  }
  return { order, items };
}
