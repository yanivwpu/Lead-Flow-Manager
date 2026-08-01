/**
 * Prospect AI personality — emoji + natural-language status (presentation only).
 * Maps to real lifecycle / enrichment states; never invents contact finds.
 */

import type { ProspectReviewLifecycle } from "./prospectReviewUx";
import { resolveProspectReviewLifecycle, type ProspectReviewUxInput } from "./prospectReviewUx";
import {
  countProspectReviewWorkStates,
  isProspectDecisionQualified,
  isProspectQualifiedCampaignBlocked,
  isProspectQualifiedForCampaign,
  isProspectVisibleInReview,
  resolveQualifiedCampaignBlockCode,
  type ProspectEmailCampaignBlockCode,
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

  if (analysis === "failed") {
    return {
      kind: "imported",
      emoji: "👋",
      // Never surface raw provider / env diagnostics in the Progress column.
      message: "AI Review couldn't be completed. Retry Qualification.",
      active: false,
    };
  }

  if (life === "imported" || analysis === "pending") {
    return {
      kind: "imported",
      emoji: "👋",
      message: "Queued for AI…",
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

export type AiGrowthAssistantBlockerLine = {
  code: ProspectEmailCampaignBlockCode | string;
  count: number;
  text: string;
};

export type AiGrowthAssistantModel = {
  idle: boolean;
  title: string;
  titleEmoji: string;
  lines: AiGrowthAssistantLine[];
  /** @deprecated Kept empty — blockers are rendered in `lines`. */
  blockerLines?: AiGrowthAssistantBlockerLine[];
  /** @deprecated Informational assistant — no clickable CTA / focus mode. */
  cta?: null;
  /** Concise guidance toward existing filters/actions — never invents a second nav. */
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

/** Full-sentence campaign-blocker copy for the Review assistant (never vague “need attention”). */
function blockerLabel(code: string, count: number): string {
  switch (code) {
    case "missing_email":
      return count === 1
        ? "1 qualified prospect is missing an email address."
        : `${count} qualified prospects are missing an email address.`;
    case "outreach_needed":
      return count === 1
        ? "1 qualified prospect still needs outreach copy."
        : `${count} qualified prospects still need outreach copy.`;
    case "enrichment_failed":
      return count === 1
        ? "1 enrichment failure can be retried."
        : `${count} enrichment failures can be retried.`;
    case "enrichment_in_progress":
      return count === 1
        ? "1 qualified prospect is still enriching."
        : `${count} qualified prospects are still enriching.`;
    case "enrichment_incomplete":
      return count === 1
        ? "1 qualified prospect still needs contact enrichment."
        : `${count} qualified prospects still need contact enrichment.`;
    case "qualification_failed":
      return count === 1
        ? "1 AI review failure can be retried."
        : `${count} AI review failures can be retried.`;
    case "qualification_incomplete":
      return count === 1
        ? "1 qualified prospect still needs AI review to finish."
        : `${count} qualified prospects still need AI review to finish.`;
    default:
      return count === 1
        ? `1 qualified prospect is blocked (${code.replace(/_/g, " ")}).`
        : `${count} qualified prospects are blocked (${code.replace(/_/g, " ")}).`;
  }
}

function countQualifiedCampaignBlockers(
  items: AiGrowthAssistantItemInput[],
): AiGrowthAssistantBlockerLine[] {
  const tallies = new Map<string, number>();
  for (const item of items) {
    const code = resolveQualifiedCampaignBlockCode(item);
    if (!code) continue;
    tallies.set(code, (tallies.get(code) || 0) + 1);
  }
  const order: ProspectEmailCampaignBlockCode[] = [
    "missing_email",
    "outreach_needed",
    "enrichment_failed",
    "enrichment_in_progress",
    "enrichment_incomplete",
    "qualification_failed",
    "qualification_incomplete",
  ];
  const lines: AiGrowthAssistantBlockerLine[] = [];
  for (const code of order) {
    const count = tallies.get(code) || 0;
    if (count <= 0) continue;
    lines.push({ code, count, text: blockerLabel(code, count) });
    tallies.delete(code);
  }
  for (const [code, count] of tallies) {
    if (count > 0) lines.push({ code, count, text: blockerLabel(code, count) });
  }
  return lines;
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
  const decisionQualified = items.filter(
    (p) => isProspectVisibleInReview(p) && isProspectDecisionQualified(p),
  ).length;
  const campaignReady = items.filter(
    (p) => isProspectVisibleInReview(p) && isProspectQualifiedForCampaign(p),
  ).length;
  const campaignBlocked = items.filter((p) => isProspectQualifiedCampaignBlocked(p)).length;
  const blockerLines = countQualifiedCampaignBlockers(items);

  const workWaiting =
    counts.needsReview > 0 ||
    decisionQualified > 0 ||
    counts.needsAttention > 0 ||
    busy ||
    bulkFailed > 0 ||
    campaignBlocked > 0;

  const resolveNextAction = (): string | null => {
    if (busy) return null;
    if (campaignReady > 0 && campaignReady === decisionQualified && decisionQualified > 0) {
      return `Send all ${campaignReady} to Campaign.`;
    }
    if (campaignReady > 0) {
      return `Send ${campaignReady} to Campaign.`;
    }
    const primaryBlocker = blockerLines[0]?.code;
    if (primaryBlocker === "missing_email") {
      return "Use Contact Info → Missing email to work through them.";
    }
    if (
      primaryBlocker === "qualification_failed" ||
      counts.qualificationFailed > 0 ||
      counts.enrichmentFailed > 0 ||
      bulkFailed > 0
    ) {
      return "Open failed rows to retry AI review.";
    }
    if (campaignBlocked > 0) {
      return "Use Contact Info and Status filters to clear Campaign blockers.";
    }
    if (counts.needsReview > 0) {
      return "Open Needs Review and decide fit for the remaining rows.";
    }
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
  } else if (busy && decisionQualified === 0) {
    if (counts.analyzing > 0) {
      lines.push({
        emoji: "🤔",
        text: `Reviewing ${pluralize(counts.analyzing, "prospect", "prospects")}`,
      });
    }
    if (counts.enriching > 0) {
      lines.push({
        emoji: "🔍",
        text: `${counts.enriching} ${counts.enriching === 1 ? "is" : "are"} being enriched.`,
      });
    }
    if (contactFound > 0) {
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
  } else {
    if (campaignReady > 0 && campaignBlocked === 0 && decisionQualified === campaignReady) {
      lines.push({
        emoji: "✅",
        text: `All ${campaignReady} prospects are Campaign Ready.`,
      });
    } else if (campaignReady > 0) {
      lines.push({
        emoji: "✅",
        text: `${campaignReady} prospect${campaignReady === 1 ? " is" : "s are"} ready for Campaign.`,
      });
    }

    // Specific blockers as primary lines — never a vague “need attention” bucket.
    for (const blocker of blockerLines) {
      if (lines.length >= 5) break;
      lines.push({ emoji: "⚠️", text: blocker.text });
    }

    if (counts.needsReview > 0 && lines.length < 5) {
      lines.push({
        emoji: "😊",
        text:
          counts.needsReview === 1
            ? "1 prospect needs human review."
            : `${counts.needsReview} prospects need human review.`,
      });
    }

    // Row-level AI/enrichment failures not already covered by campaign blockers.
    const blockerFailCodes = new Set(blockerLines.map((b) => b.code));
    const retryFail =
      (blockerFailCodes.has("qualification_failed") ? 0 : counts.qualificationFailed) +
      (blockerFailCodes.has("enrichment_failed") ? 0 : counts.enrichmentFailed) +
      bulkFailed;
    if (retryFail > 0 && lines.length < 5) {
      lines.push({
        emoji: "⚠️",
        text:
          retryFail === 1
            ? "1 AI review failure can be retried."
            : `${retryFail} AI review failures can be retried.`,
      });
    }
    if (busy && counts.analyzing > 0) {
      lines.push({
        emoji: "🤔",
        text: `Reviewing ${pluralize(counts.analyzing, "prospect", "prospects")}`,
      });
    }
    if (counts.enriching > 0) {
      lines.push({
        emoji: "🔍",
        text: `${counts.enriching} ${counts.enriching === 1 ? "is" : "are"} being enriched.`,
      });
    }
  }

  return {
    idle: !busy,
    title: "AI Growth Assistant",
    titleEmoji: "🧠",
    lines: lines.slice(0, 5),
    blockerLines: [],
    cta: null,
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
