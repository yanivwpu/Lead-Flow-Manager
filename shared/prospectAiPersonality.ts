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
};

export type AiGrowthAssistantItemInput = ProspectReviewUxInput & {
  enrichmentEmailFound?: boolean | null;
  enrichmentPhoneFound?: boolean | null;
  leadScore?: number | null;
};

/**
 * Build assistant card from current list items (no invented activity).
 * Contact-found lines require stored enrichment flags.
 */
export function buildAiGrowthAssistantModel(
  items: AiGrowthAssistantItemInput[],
): AiGrowthAssistantModel {
  let qualifying = 0;
  let enriching = 0;
  let contactFound = 0;
  let campaignReady = 0;
  let readyForReview = 0;

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

  if (!busy) {
    const lines: AiGrowthAssistantLine[] = [];
    if (readyForReview > 0) {
      lines.push({
        emoji: "😊",
        text: `${readyForReview} prospect${readyForReview === 1 ? "" : "s"} ${
          readyForReview === 1 ? "is" : "are"
        } ready for your review.`,
      });
    } else if (campaignReady > 0) {
      lines.push({
        emoji: "🎯",
        text: `${campaignReady} prospect${campaignReady === 1 ? "" : "s"} ${
          campaignReady === 1 ? "is" : "are"
        } campaign ready.`,
      });
    } else if (items.length === 0) {
      lines.push({
        emoji: "👋",
        text: "Discover businesses to get started.",
      });
    } else {
      lines.push({
        emoji: "😊",
        text: "Nothing needs attention right now.",
      });
    }
    return {
      idle: true,
      title: "AI Growth Assistant",
      titleEmoji: "🧠",
      lines: [{ emoji: "😊", text: "All caught up" }, ...lines],
    };
  }

  const lines: AiGrowthAssistantLine[] = [];
  if (qualifying > 0) {
    lines.push({
      emoji: "🤔",
      text: `Reviewing ${qualifying} new business${qualifying === 1 ? "" : "es"}`,
    });
  }
  if (enriching > 0) {
    lines.push({
      emoji: "🔍",
      text: `Analyzing ${enriching} website${enriching === 1 ? "" : "s"}`,
    });
  }
  if (contactFound > 0) {
    lines.push({
      emoji: "📧",
      text: `Found public contact details for ${contactFound} prospect${
        contactFound === 1 ? "" : "s"
      }`,
    });
  }
  if (campaignReady > 0) {
    lines.push({
      emoji: "🎯",
      text: `${campaignReady} prospect${campaignReady === 1 ? "" : "s"} ${
        campaignReady === 1 ? "is" : "are"
      } campaign ready`,
    });
  }

  return {
    idle: false,
    title: "AI Growth Assistant",
    titleEmoji: "🧠",
    lines,
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
