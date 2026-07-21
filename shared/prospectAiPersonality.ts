/**
 * Prospect AI personality — emoji + natural-language status (presentation only).
 * Maps to real lifecycle / enrichment states; never invents contact finds.
 */

import type { ProspectReviewLifecycle } from "./prospectReviewUx";
import { resolveProspectReviewLifecycle, type ProspectReviewUxInput } from "./prospectReviewUx";

/** Interval between rotating activity lines (ms). Keep ≥ 4s for calm UX. */
export const AI_PERSONALITY_ROTATE_MS = 5000;

export type AiPersonalityKind =
  | "imported"
  | "qualifying"
  | "matching_brain"
  | "website"
  | "contact_extract"
  | "outreach_angle"
  | "ready_review"
  | "campaign_ready"
  | "excellent_match"
  | "won"
  | "idle";

export type AiPersonalityStatus = {
  kind: AiPersonalityKind;
  emoji: string;
  /** Readable status; emoji is separate for accessibility / animation. */
  message: string;
  /** True when AI work is actively in progress (allow subtle motion). */
  active: boolean;
};

const QUALIFY_ROTATION: AiPersonalityStatus[] = [
  {
    kind: "qualifying",
    emoji: "🤔",
    message: "AI is reviewing this business…",
    active: true,
  },
  {
    kind: "matching_brain",
    emoji: "🧐",
    message: "Matching it with AI Brain…",
    active: true,
  },
  {
    kind: "outreach_angle",
    emoji: "💡",
    message: "Preparing an outreach angle…",
    active: true,
  },
];

/** Broad, truthful enrichment lines — no fake page-level progress. */
const ENRICH_ROTATION: AiPersonalityStatus[] = [
  {
    kind: "website",
    emoji: "🔍",
    message: "Analyzing the public website…",
    active: true,
  },
  {
    kind: "website",
    emoji: "📖",
    message: "Learning from the public website…",
    active: true,
  },
  {
    kind: "contact_extract",
    emoji: "📧",
    message: "Looking for public contact details…",
    active: true,
  },
  {
    kind: "outreach_angle",
    emoji: "💡",
    message: "Preparing campaign recommendations…",
    active: true,
  },
];

function pickRotated(list: AiPersonalityStatus[], seed: string, tick: number): AiPersonalityStatus {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash + seed.charCodeAt(i) * (i + 1)) % 997;
  const step = Math.max(0, Math.floor(tick));
  return list[(hash + step) % list.length];
}

/**
 * Row-level personality from real analysis / enrichment / lifecycle state.
 * `tick` advances every AI_PERSONALITY_ROTATE_MS (~5s).
 */
export function resolveAiPersonalityStatus(params: {
  ux: ProspectReviewUxInput;
  seed: string;
  tick?: number;
  leadScore?: number | null;
}): AiPersonalityStatus {
  const life = resolveProspectReviewLifecycle(params.ux);
  const tick = params.tick ?? 0;
  const analysis = String(params.ux.analysisStatus || "pending").toLowerCase();
  const enrichment = String(params.ux.enrichmentStatus || "none").toLowerCase();

  if (life === "won") {
    return { kind: "won", emoji: "🏆", message: "Customer won.", active: false };
  }

  if (enrichment === "pending" || enrichment === "enriching") {
    return pickRotated(ENRICH_ROTATION, params.seed, tick);
  }

  if (analysis === "processing") {
    return pickRotated(QUALIFY_ROTATION, params.seed, tick);
  }

  if (life === "imported" || analysis === "pending") {
    return {
      kind: "imported",
      emoji: "👋",
      message: "Preparing the prospect…",
      active: false,
    };
  }

  if (life === "ready_for_approval") {
    const score = typeof params.leadScore === "number" ? params.leadScore : 0;
    if (score >= 85) {
      return {
        kind: "excellent_match",
        emoji: "🎉",
        message: "Excellent match found.",
        active: false,
      };
    }
    return {
      kind: "ready_review",
      emoji: "😊",
      message: "Ready for your review.",
      active: false,
    };
  }

  if (life === "campaign_ready" || life === "queued" || life === "campaign") {
    return {
      kind: "campaign_ready",
      emoji: "🎯",
      message: "Ready for outreach.",
      active: false,
    };
  }

  if (life === "inbox") {
    return {
      kind: "campaign_ready",
      emoji: "🎯",
      message: "Ready for outreach.",
      active: false,
    };
  }

  return {
    kind: "idle",
    emoji: "😊",
    message: "All caught up.",
    active: false,
  };
}

export type AiGrowthAssistantLine = {
  emoji: string;
  text: string;
};

export type AiGrowthAssistantModel = {
  idle: boolean;
  title: string;
  titleEmoji: string;
  lines: AiGrowthAssistantLine[];
  /** Concise next step from real counts — never invented. */
  nextAction?: string | null;
};

export type AiGrowthAssistantItemInput = ProspectReviewUxInput & {
  enrichmentEmailFound?: boolean | null;
  enrichmentPhoneFound?: boolean | null;
  leadScore?: number | null;
};

export type AiGrowthAssistantOptions = {
  /** Failed qualifications from last completed bulk job (optional). */
  failedQualificationCount?: number;
};

function pluralize(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Build assistant card from current list items (no invented activity).
 * Contact-found lines require stored enrichment flags.
 */
export function buildAiGrowthAssistantModel(
  items: AiGrowthAssistantItemInput[],
  options?: AiGrowthAssistantOptions,
): AiGrowthAssistantModel {
  let qualifying = 0;
  let enriching = 0;
  let contactFound = 0;
  let campaignReady = 0;
  let readyForReview = 0;
  const failed = Math.max(0, options?.failedQualificationCount ?? 0);

  for (const item of items) {
    const life = resolveProspectReviewLifecycle(item);
    const analysis = String(item.analysisStatus || "pending").toLowerCase();
    const enrichment = String(item.enrichmentStatus || "none").toLowerCase();

    if (analysis === "processing" || analysis === "pending") {
      qualifying += 1;
    }
    if (enrichment === "pending" || enrichment === "enriching") {
      enriching += 1;
    }
    if (
      enrichment === "completed" &&
      (item.enrichmentEmailFound === true || item.enrichmentPhoneFound === true)
    ) {
      contactFound += 1;
    }
    if (life === "campaign_ready") {
      campaignReady += 1;
    }
    if (life === "ready_for_approval") {
      readyForReview += 1;
    }
  }

  const busy = qualifying > 0 || enriching > 0;

  const resolveNextAction = (): string | null => {
    if (readyForReview > 0) {
      return `Approve ${pluralize(readyForReview, "business", "businesses")}`;
    }
    if (campaignReady > 0 && !busy) {
      return `Launch campaign for ${pluralize(campaignReady, "ready prospect", "ready prospects")}`;
    }
    if (busy) return null;
    if (items.length === 0) return "Discover businesses to get started";
    return null;
  };

  if (!busy) {
    const lines: AiGrowthAssistantLine[] = [{ emoji: "😊", text: "Everything is caught up." }];
    if (readyForReview > 0) {
      lines.push({
        emoji: "😊",
        text: `Waiting for your approval on ${pluralize(readyForReview, "prospect", "prospects")}.`,
      });
    }
    if (campaignReady > 0) {
      lines.push({
        emoji: "🎯",
        text: `${pluralize(campaignReady, "prospect is", "prospects are")} ready for campaign.`,
      });
    }
    if (failed > 0) {
      lines.push({
        emoji: "⚠️",
        text: `${pluralize(failed, "qualification failed", "qualifications failed")} — open a row to retry.`,
      });
    }
    if (readyForReview === 0 && campaignReady === 0 && items.length === 0) {
      lines.push({ emoji: "👋", text: "No reviews waiting. Discover businesses to begin." });
    } else if (readyForReview === 0 && campaignReady === 0 && failed === 0 && items.length > 0) {
      lines.push({ emoji: "✨", text: "No reviews waiting." });
    }
    return {
      idle: true,
      title: "AI Growth Assistant",
      titleEmoji: "🧠",
      lines,
      nextAction: resolveNextAction(),
    };
  }

  const lines: AiGrowthAssistantLine[] = [];
  if (qualifying > 0) {
    lines.push({
      emoji: "🤔",
      text: `Reviewing ${pluralize(qualifying, "business", "businesses")}`,
    });
  }
  if (enriching > 0) {
    lines.push({
      emoji: "🔍",
      text: `Analyzing ${pluralize(enriching, "website", "websites")}`,
    });
  }
  if (contactFound > 0) {
    lines.push({
      emoji: "📧",
      text: `Found public contact details for ${pluralize(contactFound, "prospect", "prospects")}`,
    });
  }
  if (campaignReady > 0) {
    lines.push({
      emoji: "🎯",
      text: `${campaignReady} ${campaignReady === 1 ? "is" : "are"} ready for campaign`,
    });
  }
  if (readyForReview > 0) {
    lines.push({
      emoji: "😊",
      text: `${pluralize(readyForReview, "prospect", "prospects")} ready for your review`,
    });
  }
  if (failed > 0) {
    lines.push({
      emoji: "⚠️",
      text: `${pluralize(failed, "qualification failed", "qualifications failed")}`,
    });
  }

  return {
    idle: false,
    title: "AI Growth Assistant",
    titleEmoji: "🧠",
    lines,
    nextAction: resolveNextAction(),
  };
}

/** Lifecycle label for tests / docs — personality kind by life when idle. */
export function aiPersonalityKindForLifecycle(
  life: ProspectReviewLifecycle,
): AiPersonalityKind {
  if (life === "imported") return "imported";
  if (life === "analyzing") return "qualifying";
  if (life === "website_intelligence") return "website";
  if (life === "ready_for_approval") return "ready_review";
  if (life === "campaign_ready") return "campaign_ready";
  if (life === "won") return "won";
  return "idle";
}

export function shouldAnimateAiEmoji(active: boolean, prefersReducedMotion: boolean): boolean {
  return active && !prefersReducedMotion;
}
