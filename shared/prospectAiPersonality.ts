/**
 * Prospect AI personality — emoji + natural-language status (presentation only).
 * Maps to real lifecycle / enrichment states; never invents contact finds.
 */

import type { ProspectReviewLifecycle } from "./prospectReviewUx";
import { resolveProspectReviewLifecycle, type ProspectReviewUxInput } from "./prospectReviewUx";
import {
  countProspectReviewWorkStates,
  type ProspectReviewStateInput,
} from "./prospectAiReviewState";

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
      message: analysis === "failed" ? "Qualification failed — retry available." : "Queued for AI…",
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

export type AiGrowthAssistantItemInput = ProspectReviewStateInput & {
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
 * Build Review assistant from shared work-state counts (no invented activity).
 */
export function buildAiGrowthAssistantModel(
  items: AiGrowthAssistantItemInput[],
  options?: AiGrowthAssistantOptions,
): AiGrowthAssistantModel {
  const counts = countProspectReviewWorkStates(items);
  const contactFound = items.filter(
    (item) =>
      String(item.enrichmentStatus || "").toLowerCase() === "completed" &&
      (item.enrichmentEmailFound === true || item.enrichmentPhoneFound === true),
  ).length;
  const bulkFailed = Math.max(0, options?.failedQualificationCount ?? 0);
  const busy = counts.analyzing > 0 || counts.enriching > 0;
  const workWaiting =
    counts.needsReview > 0 ||
    counts.qualified > 0 ||
    counts.needsAttention > 0 ||
    busy ||
    bulkFailed > 0;

  const resolveNextAction = (): string | null => {
    if (counts.enrichmentFailed > 0 || counts.qualificationFailed > 0) {
      return `Review ${counts.enrichmentFailed + counts.qualificationFailed} failed ${
        counts.enrichmentFailed + counts.qualificationFailed === 1 ? "item" : "items"
      }.`;
    }
    if (counts.needsAttention > 0) {
      return `Review ${counts.needsAttention} ${
        counts.needsAttention === 1 ? "item that needs" : "items that need"
      } attention.`;
    }
    // needsReview chip includes enriching/analyzing — only prompt Enrich when humans can act
    const waitingForEnrich = Math.max(
      0,
      counts.needsReview - counts.enriching - counts.analyzing - counts.needsAttention,
    );
    if (waitingForEnrich > 0) return "Select prospects to enrich.";
    if (counts.qualified > 0) {
      return `Send ${counts.qualified} qualified ${
        counts.qualified === 1 ? "prospect" : "prospects"
      } to Campaigns.`;
    }
    if (busy) return null;
    if (items.length === 0) return "Discover businesses to get started.";
    return "Discover more businesses when ready.";
  };

  const lines: AiGrowthAssistantLine[] = [];

  if (items.length === 0) {
    lines.push({ emoji: "👋", text: "No prospects in Review yet." });
    lines.push({ emoji: "✨", text: "Discover businesses to get started." });
  } else if (!workWaiting) {
    lines.push({ emoji: "😊", text: "Everything is caught up." });
    lines.push({ emoji: "✨", text: "No prospects require attention." });
  } else {
    const needsReviewLine = Math.max(
      0,
      counts.needsReview - counts.enriching - counts.analyzing,
    );
    if (needsReviewLine > 0) {
      lines.push({
        emoji: "😊",
        text: `${pluralize(needsReviewLine, "prospect needs", "prospects need")} review.`,
      });
    }
    if (counts.enriching > 0) {
      lines.push({
        emoji: "🔍",
        text: `${counts.enriching} ${counts.enriching === 1 ? "is" : "are"} being enriched.`,
      });
    }
    if (counts.qualified > 0) {
      lines.push({
        emoji: "✅",
        text: `${counts.qualified} ${
          counts.qualified === 1 ? "was" : "were"
        } enriched successfully.`,
      });
    }
    if (counts.enrichmentFailed > 0 || counts.qualificationFailed > 0) {
      const n = counts.enrichmentFailed + counts.qualificationFailed;
      lines.push({
        emoji: "⚠️",
        text: `${n} failed and can be retried.`,
      });
    }
    if (counts.missingWebsite > 0) {
      lines.push({
        emoji: "🌐",
        text: `${pluralize(counts.missingWebsite, "prospect has", "prospects have")} no website available.`,
      });
    }
    if (counts.missingEmail > 0) {
      lines.push({
        emoji: "📧",
        text: `${pluralize(counts.missingEmail, "prospect is", "prospects are")} missing required contact info.`,
      });
    }
    if (busy && counts.analyzing > 0) {
      lines.push({
        emoji: "🤔",
        text: `Reviewing ${pluralize(counts.analyzing, "prospect", "prospects")}`,
      });
    }
    if (contactFound > 0 && busy) {
      lines.push({
        emoji: "📧",
        text: `Found public contact details for ${pluralize(contactFound, "prospect", "prospects")}`,
      });
    }
    if (bulkFailed > 0) {
      lines.push({
        emoji: "⚠️",
        text: `${pluralize(bulkFailed, "qualification failed", "qualifications failed")} — open a row to retry.`,
      });
    }
  }

  return {
    idle: !busy,
    title: "AI Growth Assistant",
    titleEmoji: "🧠",
    lines: lines.slice(0, 5),
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
