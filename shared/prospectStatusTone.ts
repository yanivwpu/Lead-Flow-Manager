/**
 * Shared Prospect AI status → visual tone mapping.
 * Red/danger is reserved for real processing failures, never missing-data outcomes.
 */

import type { ProspectEnrichmentUxStatusCode } from "./prospectEnrichmentStatusUx";
import type { ProspectProgressStateCode } from "./prospectAiReviewErrors";
import type { ProspectNeedsReviewBadgeCode } from "./prospectAiReviewState";
import type { ProspectTimelineStageState } from "./prospectReviewUx";

/** Semantic tone used by Progress, timeline, chips, badges, and text. */
export type ProspectStatusTone =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral"
  | "muted";

export type ProspectStatusToneClasses = {
  text: string;
  textStrong: string;
  bg: string;
  border: string;
  chip: string;
  iconBg: string;
  iconText: string;
};

export const PROSPECT_STATUS_TONE_CLASSES: Record<ProspectStatusTone, ProspectStatusToneClasses> = {
  success: {
    text: "text-emerald-700",
    textStrong: "text-emerald-800",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    chip: "bg-emerald-50 text-emerald-800",
    iconBg: "bg-emerald-600 text-white",
    iconText: "text-emerald-700",
  },
  warning: {
    text: "text-amber-700",
    textStrong: "text-amber-800",
    bg: "bg-amber-50",
    border: "border-amber-200",
    chip: "bg-amber-50 text-amber-800",
    iconBg: "bg-amber-500 text-white",
    iconText: "text-amber-700",
  },
  danger: {
    text: "text-red-600",
    textStrong: "text-red-700",
    bg: "bg-rose-50",
    border: "border-rose-200",
    chip: "bg-rose-50 text-rose-800",
    iconBg: "bg-red-500 text-white",
    iconText: "text-red-600",
  },
  info: {
    text: "text-sky-700",
    textStrong: "text-sky-800",
    bg: "bg-sky-50",
    border: "border-sky-200",
    chip: "bg-sky-50 text-sky-800",
    iconBg: "bg-sky-500 text-white",
    iconText: "text-sky-700",
  },
  neutral: {
    text: "text-gray-700",
    textStrong: "text-gray-900",
    bg: "bg-gray-50",
    border: "border-gray-200",
    chip: "bg-gray-50 text-gray-600",
    iconBg: "bg-gray-400 text-white",
    iconText: "text-gray-600",
  },
  muted: {
    text: "text-gray-400",
    textStrong: "text-gray-500",
    bg: "bg-white",
    border: "border-gray-300",
    chip: "bg-gray-50 text-gray-400",
    iconBg: "border border-gray-300 bg-white text-gray-300",
    iconText: "text-gray-400",
  },
};

/** Enrichment presentation codes → tone (never danger for missing data). */
export function resolveProspectEnrichmentUxTone(
  code: ProspectEnrichmentUxStatusCode,
): ProspectStatusTone {
  switch (code) {
    case "enrichment_complete":
      return "success";
    case "partially_enriched":
    case "enrichment_unavailable":
      return "warning";
    case "ready_to_enrich":
    case "in_progress":
      return "info";
    case "not_run":
    default:
      return "muted";
  }
}

/** Progress column codes → tone. */
export function resolveProspectProgressTone(
  code: ProspectProgressStateCode,
): ProspectStatusTone {
  switch (code) {
    case "ready_for_campaign":
    case "enriched":
    case "in_campaign":
      return "success";
    case "partially_enriched":
    case "enrichment_unavailable":
    case "needs_review":
      return "warning";
    case "failed":
      return "danger";
    case "reviewing":
    case "retrying":
    case "enriching":
    case "ready_to_enrich":
      return "info";
    case "not_qualified":
      return "neutral";
    case "queued":
    default:
      return "muted";
  }
}

/**
 * Timeline stage visual tone.
 * `attention` = amber missing-data / partial enrichment (never red).
 * `failed` = real processing failure only.
 */
export function resolveProspectTimelineStageTone(
  state: ProspectTimelineStageState,
): ProspectStatusTone {
  switch (state) {
    case "done":
      return "success";
    case "current":
      return "info";
    case "attention":
      return "warning";
    case "failed":
      return "danger";
    case "todo":
    default:
      return "muted";
  }
}

/** Outcome badge codes → tone. */
export function resolveProspectNeedsReviewBadgeTone(
  code: ProspectNeedsReviewBadgeCode,
): ProspectStatusTone {
  switch (code) {
    case "qualified":
      return "success";
    case "ai_review_failed":
      return "danger";
    // Enrichment soft outcomes / missing data — amber, not infrastructure red.
    case "enrichment_failed":
    case "missing_email":
    case "missing_website":
    case "missing_information":
    case "needs_review":
    case "discovery_attention":
    case "outreach_needed":
      return "warning";
    case "enriching":
    case "analyzing":
      return "info";
    case "not_qualified":
      return "neutral";
    default:
      return "neutral";
  }
}

/** Channel chip: found = green; missing = amber (never red). */
export function resolveProspectChannelChipTone(found: boolean): ProspectStatusTone {
  return found ? "success" : "warning";
}

export function prospectToneBadgeClass(tone: ProspectStatusTone): string {
  const c = PROSPECT_STATUS_TONE_CLASSES[tone];
  return `${c.border} ${c.bg} ${c.textStrong}`;
}

export function prospectToneChipClass(tone: ProspectStatusTone): string {
  return PROSPECT_STATUS_TONE_CLASSES[tone].chip;
}

export function prospectToneTextClass(tone: ProspectStatusTone, strong = false): string {
  const c = PROSPECT_STATUS_TONE_CLASSES[tone];
  return strong ? c.textStrong : c.text;
}
