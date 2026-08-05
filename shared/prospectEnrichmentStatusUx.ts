/**
 * Prospect enrichment status presentation — clarifies Complete vs Partial vs Campaign-ready.
 * Display only; does not change enrichment workers or gates.
 */

import {
  isValidProspectEmail,
  isValidProspectPhone,
} from "./prospectContactEnrichment";
import { prospectHasOfficialWebsiteUrl } from "./prospectEnrichmentOutcome";
import {
  isProspectEnrichmentComplete,
  isProspectEnrichmentFailed,
  isProspectEnrichmentInProgress,
} from "./prospectReviewUx";

export type ProspectEnrichmentChannelId = "phone" | "social" | "website" | "email";

export type ProspectEnrichmentChannelItem = {
  id: ProspectEnrichmentChannelId;
  label: string;
  found: boolean;
};

export type ProspectEnrichmentUxStatusCode =
  | "not_run"
  | "in_progress"
  | "failed"
  | "enrichment_complete"
  | "partially_enriched";

export type ProspectEnrichmentStatusUxInput = {
  enrichmentStatus?: string | null;
  enrichmentEmailFound?: boolean | null;
  enrichmentPhoneFound?: boolean | null;
  enrichmentResult?: unknown;
  email?: string | null;
  phone?: string | null;
  websiteUrl?: string | null;
  websiteUrlUsed?: string | null;
};

export type ProspectEnrichmentStatusUx = {
  code: ProspectEnrichmentUxStatusCode;
  /** User-facing status title. */
  label: string;
  channels: ProspectEnrichmentChannelItem[];
  /** Enrichment finished (completed or failed after an attempt). */
  finished: boolean;
  /**
   * When enrichment finished but sources were missing — never implies the job is still running.
   */
  unavailableExplanation: string | null;
};

function readSocialFound(enrichmentResult: unknown): boolean {
  if (!enrichmentResult || typeof enrichmentResult !== "object") return false;
  const contacts = (enrichmentResult as { publicContacts?: { socialProfiles?: unknown } })
    .publicContacts;
  const profiles = contacts?.socialProfiles;
  return Array.isArray(profiles) && profiles.length > 0;
}

/** Compact channel checklist — Phone · Social · Website · Email. */
export function resolveProspectEnrichmentChannels(
  input: ProspectEnrichmentStatusUxInput,
): ProspectEnrichmentChannelItem[] {
  const email =
    input.enrichmentEmailFound === true || isValidProspectEmail(input.email);
  const phone =
    input.enrichmentPhoneFound === true || isValidProspectPhone(input.phone);
  const website = prospectHasOfficialWebsiteUrl(input);
  const social = readSocialFound(input.enrichmentResult);

  return [
    { id: "phone", label: "Phone", found: phone },
    { id: "social", label: "Social", found: social },
    { id: "website", label: "Website", found: website },
    { id: "email", label: "Email", found: email },
  ];
}

export function formatProspectEnrichmentChannelMarks(
  channels: ProspectEnrichmentChannelItem[],
): string {
  return channels
    .map((c) => `${c.found ? "✓" : "✕"} ${c.label}`)
    .join(" · ");
}

function buildUnavailableExplanation(
  channels: ProspectEnrichmentChannelItem[],
): string | null {
  const missingIds = channels.filter((c) => !c.found).map((c) => c.id);
  if (missingIds.length === 0) return null;

  const hasWebsite = !missingIds.includes("website");
  const hasEmail = !missingIds.includes("email");

  if (!hasWebsite && !hasEmail) {
    return "Enrichment finished, but no website or email was available. Add a website to retry enrichment, or add an email to unlock Campaign.";
  }
  if (!hasWebsite) {
    return "Enrichment finished, but no crawlable website was available. Add an official website to find more contact details.";
  }
  if (!hasEmail) {
    return "Enrichment finished, but no email was found. Add an email to unlock Campaign.";
  }
  const labels = channels
    .filter((c) => !c.found)
    .map((c) => c.label.toLowerCase());
  if (labels.length === 1) {
    return `Enrichment finished, but ${labels[0]} was unavailable.`;
  }
  return `Enrichment finished, but ${labels.join(" and ")} were unavailable.`;
}

/**
 * Distinguishes Enrichment Complete vs Partially Enriched after a finished run.
 * Ready for Campaign is a separate campaign-gate status (not returned here).
 */
export function resolveProspectEnrichmentStatusUx(
  input: ProspectEnrichmentStatusUxInput,
): ProspectEnrichmentStatusUx {
  const channels = resolveProspectEnrichmentChannels(input);
  const emailOk = channels.find((c) => c.id === "email")?.found === true;
  const websiteOk = channels.find((c) => c.id === "website")?.found === true;

  if (isProspectEnrichmentInProgress(input.enrichmentStatus)) {
    return {
      code: "in_progress",
      label: "In progress",
      channels,
      finished: false,
      unavailableExplanation: null,
    };
  }

  if (isProspectEnrichmentComplete(input.enrichmentStatus)) {
    if (emailOk && websiteOk) {
      return {
        code: "enrichment_complete",
        label: "Enrichment Complete",
        channels,
        finished: true,
        unavailableExplanation: null,
      };
    }
    return {
      code: "partially_enriched",
      label: "Partially Enriched",
      channels,
      finished: true,
      unavailableExplanation: buildUnavailableExplanation(channels),
    };
  }

  if (isProspectEnrichmentFailed(input.enrichmentStatus)) {
    return {
      code: "partially_enriched",
      label: "Partially Enriched",
      channels,
      finished: true,
      unavailableExplanation: buildUnavailableExplanation(channels),
    };
  }

  return {
    code: "not_run",
    label: "Not run",
    channels,
    finished: false,
    unavailableExplanation: null,
  };
}

/** Timeline / short label for the enrichment stage. */
export function prospectEnrichmentTimelineLabel(
  ux: Pick<ProspectEnrichmentStatusUx, "code" | "finished">,
): { full: string; short: string } {
  switch (ux.code) {
    case "enrichment_complete":
      return { full: "Enrichment Complete", short: "Complete" };
    case "partially_enriched":
      return { full: "Partially Enriched", short: "Partial" };
    case "in_progress":
      return { full: "Enriching", short: "Enrich" };
    default:
      return { full: "Enrichment", short: "Enrich" };
  }
}
