/**
 * Safe visitor-facing name personalization.
 * Usability comes from identity validation + provenance, not a first-token split
 * of stored placeholders such as "Website Visitor".
 */

import { isAnonymousWebchatVisitorName } from "./agent/webchatLeadContext";
import { storedWebchatIdentityStatus } from "./webchatContactIdentity";
import { isValidIdentityName } from "./webchatIdentityFields";

const CHANNEL_OR_PLACEHOLDER_LABELS = new Set(
  [
    "website",
    "web chat",
    "webchat",
    "website chat",
    "unknown",
    "visitor",
    "guest",
    "anonymous",
    "website visitor",
    "agent page visitor",
    "embedded agent page visitor",
  ].map((s) => s.toLowerCase()),
);

function normalizeLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function isChannelOrSiteLabel(
  name: string,
  extras?: { workspaceName?: string | null; pageTitle?: string | null },
): boolean {
  const n = normalizeLabel(name);
  if (!n) return true;
  if (CHANNEL_OR_PLACEHOLDER_LABELS.has(n)) return true;
  const first = n.split(/\s+/)[0] || "";
  if (CHANNEL_OR_PLACEHOLDER_LABELS.has(first)) return true;
  const workspace = extras?.workspaceName ? normalizeLabel(extras.workspaceName) : "";
  const pageTitle = extras?.pageTitle ? normalizeLabel(extras.pageTitle) : "";
  if (workspace && (n === workspace || first === workspace)) return true;
  if (pageTitle && (n === pageTitle || first === pageTitle)) return true;
  return false;
}

export type VisitorPersonalizationInput = {
  name?: string | null;
  source?: string | null;
  sourceDetails?: unknown;
  customFields?: unknown;
  workspaceName?: string | null;
  pageTitle?: string | null;
};

/**
 * Full stored name that is safe to address the visitor with.
 * Anonymous / channel / site / workspace labels are omitted entirely.
 */
export function usableVisitorPersonalizationName(
  input: VisitorPersonalizationInput,
): string | null {
  const raw = (input.name || "").trim();
  if (!raw) return null;
  if (isAnonymousWebchatVisitorName(raw)) return null;

  const identityStatus = storedWebchatIdentityStatus({
    customFields: input.customFields,
    sourceDetails: input.sourceDetails,
    name: input.name,
    source: input.source,
  });

  const validated = isValidIdentityName(raw);
  if (!validated) return null;
  if (isChannelOrSiteLabel(validated, input)) return null;

  if (identityStatus === "anonymous" && isChannelOrSiteLabel(raw, input)) {
    return null;
  }

  return validated;
}

/** First token of a verified human name only — never of a placeholder. */
export function usableVisitorPersonalizationFirstName(
  input: VisitorPersonalizationInput,
): string | null {
  const full = usableVisitorPersonalizationName(input);
  if (!full) return null;
  return full.split(/\s+/)[0] || null;
}

export function formatPersonalizedBookingLinkReply(
  schedulingUrl: string,
  contact: VisitorPersonalizationInput,
): string {
  const name = usableVisitorPersonalizationFirstName(contact);
  return name
    ? `Hi ${name}! Sure — you can pick a time here: ${schedulingUrl}`
    : `Sure — you can pick a time here: ${schedulingUrl}`;
}
