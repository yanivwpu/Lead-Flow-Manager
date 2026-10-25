/**
 * Backlink Intelligence — conservative opportunity triage.
 *
 * Accepts externally verified evidence only. Does not crawl, send outreach,
 * infer existing backlinks from Search Console performance, or publish links.
 */
export type BacklinkCandidate = {
  sourceUrl: string;
  targetUrl: string;
  topic: "shopify" | "realtor" | "whatsapp-crm" | "automation" | "other";
  evidence: string;
  contactPermission: "explicit" | "unknown" | "opted_out";
  placement: "editorial" | "directory" | "partner" | "paid" | "unknown";
  verifiedAt?: string;
};

export type BacklinkDecision = {
  status: "review" | "reject";
  reasons: string[];
  canonicalSource: string | null;
};

const MARKETING_HOST = "www.whachatcrm.com";
const EXCLUDED_HOSTS = new Set(["localhost", "127.0.0.1", "whachatcrm.com", "www.whachatcrm.com", "app.whachatcrm.com"]);
const HIGH_RELEVANCE = new Set(["shopify", "realtor", "whatsapp-crm", "automation"]);

export function assessBacklinkCandidate(candidate: BacklinkCandidate): BacklinkDecision {
  const reasons: string[] = [];
  let canonicalSource: string | null = null;
  try {
    const url = new URL(candidate.sourceUrl);
    if (url.protocol !== "https:" || !url.hostname.includes(".") || url.username || url.password) reasons.push("invalid_source");
    else {
      canonicalSource = url.origin + url.pathname.replace(/\/$/, "");
      if (EXCLUDED_HOSTS.has(url.hostname.toLowerCase()) || url.hostname.endsWith(".whachatcrm.com")) reasons.push("self_link");
    }
  } catch { reasons.push("invalid_source"); }

  try {
    const target = new URL(candidate.targetUrl);
    if (target.protocol !== "https:" || target.hostname.toLowerCase() !== MARKETING_HOST || target.username || target.password)
      reasons.push("noncanonical_target");
  } catch { reasons.push("noncanonical_target"); }

  if (!HIGH_RELEVANCE.has(candidate.topic)) reasons.push("irrelevant_topic");
  if (candidate.evidence.trim().length < 30) reasons.push("insufficient_evidence");
  if (!candidate.verifiedAt || Number.isNaN(Date.parse(candidate.verifiedAt))) reasons.push("unverified_source");
  if (candidate.contactPermission === "opted_out") reasons.push("contact_opted_out");
  if (candidate.contactPermission === "unknown") reasons.push("contact_permission_unknown");
  if (candidate.placement === "paid") reasons.push("paid_link_requires_sponsored_tag");
  if (candidate.placement === "unknown") reasons.push("placement_unverified");

  return { status: reasons.length ? "reject" : "review", reasons, canonicalSource };
}

export function dedupeBacklinkCandidates(candidates: BacklinkCandidate[]): BacklinkCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const result = assessBacklinkCandidate(candidate);
    const key = result.canonicalSource?.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
