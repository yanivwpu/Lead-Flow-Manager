/**
 * Phase 2 discovery quality, relevance, and identity helpers (pure, no I/O).
 */

export const PROSPECT_AI_DISCOVERY_REASON_CODES = [
  "permanently_closed",
  "invalid_business_identity",
  "directory_or_aggregator",
  "industry_mismatch",
  "likely_duplicate",
  "social_profile_as_website",
  "malformed_provider_record",
  "already_in_workspace",
  "in_run_duplicate",
  "uncertain_category",
  /** @deprecated alias — prefer uncertain_category */
  "category_uncertain",
  "uncertain_industry_relevance",
  "limited_business_details",
  "possible_branch_duplicate",
  /** @deprecated alias — prefer possible_branch_duplicate */
  "possible_branch",
  "possible_existing_workspace_match",
] as const;
export type ProspectAiDiscoveryReasonCode =
  (typeof PROSPECT_AI_DISCOVERY_REASON_CODES)[number];

/** Usable but uncertain — may count toward target + quota. */
export const PROSPECT_AI_USABLE_NEEDS_ATTENTION_REASONS = [
  "uncertain_category",
  "category_uncertain",
  "social_profile_as_website",
  "limited_business_details",
  "uncertain_industry_relevance",
] as const;

/** Possible duplicate — show for transparency, do not count/charge until confirmed. */
export const PROSPECT_AI_POSSIBLE_DUPLICATE_REASONS = [
  "likely_duplicate",
  "possible_existing_workspace_match",
  "possible_branch_duplicate",
  "possible_branch",
] as const;

export type ProspectAiDiscoveryDisposition =
  | "ready"
  | "needs_attention"
  | "possible_duplicate"
  | "already_exists"
  | "already_archived"
  | "rejected";

export function isUsableNeedsAttentionReason(
  reason: string | null | undefined,
): boolean {
  return (PROSPECT_AI_USABLE_NEEDS_ATTENTION_REASONS as readonly string[]).includes(
    String(reason || ""),
  );
}

export function isPossibleDuplicateReason(
  reason: string | null | undefined,
): boolean {
  return (PROSPECT_AI_POSSIBLE_DUPLICATE_REASONS as readonly string[]).includes(
    String(reason || ""),
  );
}

/** Ready + usable needs-attention count; possible duplicates do not. */
export function countsTowardDiscoveryTarget(params: {
  disposition: ProspectAiDiscoveryDisposition | string;
  attentionReason?: string | null;
}): boolean {
  if (params.disposition === "ready") return true;
  if (params.disposition === "needs_attention") {
    return isUsableNeedsAttentionReason(params.attentionReason);
  }
  return false;
}

/** Friendly Review/Discover reason copy for discovery attention codes. */
export function discoveryAttentionLabel(reason: string | null | undefined): string {
  switch (String(reason || "")) {
    case "social_profile_as_website":
      return "Website appears to be a social profile";
    case "uncertain_category":
    case "category_uncertain":
      return "Category uncertain";
    case "uncertain_industry_relevance":
      return "Industry uncertain";
    case "limited_business_details":
      return "Missing business details";
    case "likely_duplicate":
      return "Possible duplicate";
    case "possible_existing_workspace_match":
      return "Possible match to an existing record";
    case "possible_branch_duplicate":
    case "possible_branch":
      return "Possible branch or related location";
    case "industry_mismatch":
      return "May not match the requested industry";
    default:
      return reason ? String(reason).replace(/_/g, " ") : "Needs a closer look";
  }
}

const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "aol.com",
  "icloud.com",
  "mail.com",
  "proton.me",
  "protonmail.com",
]);

const DIRECTORY_HOST_RE =
  /\b(yelp\.com|yellowpages\.com|bbb\.org|mapquest\.com|foursquare\.com|tripadvisor\.com|angi\.com|thumbtack\.com|houzz\.com|manta\.com|superpages\.com|whitepages\.com|bizapedia\.com|zoominfo\.com|crunchbase\.com|facebook\.com\/pages|linkedin\.com\/company)\b/i;

const DIRECTORY_NAME_RE =
  /\b(directory|yellow\s*pages|best\s*of|top\s*\d+|listings?\s*site|business\s*directory)\b/i;

const SOCIAL_HOST_RE =
  /\b(facebook\.com|instagram\.com|linkedin\.com|twitter\.com|x\.com|tiktok\.com|youtube\.com)\b/i;

/** Extract registrable-ish hostname without www. */
export function normalizeWebsiteDomain(website: string | null | undefined): string | null {
  const raw = String(website || "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (!host || !host.includes(".")) return null;
    return host;
  } catch {
    return null;
  }
}

export function normalizePhoneDigits(phone: string | null | undefined): string | null {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 7) return null;
  // Prefer last 10 for NANP comparisons
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function normalizeBusinessName(name: string | null | undefined): string {
  return String(name || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(
      /\b(llc|inc|incorporated|corp|corporation|ltd|co|company|plc|pllc|pc|pa|group|team|realty|real\s*estate)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

export function extractCityFromAddress(address: string | null | undefined): string | null {
  const a = String(address || "").trim();
  if (!a) return null;
  // "123 Main St, Miami, FL 33101" → Miami
  const parts = a.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const city = parts[parts.length - 2] || "";
    // If that piece looks like "FL 33101", take earlier
    if (/^[A-Z]{2}\s+\d/.test(city) && parts.length >= 3) {
      return parts[parts.length - 3]!.toLowerCase();
    }
    return city.toLowerCase().replace(/\s+/g, " ") || null;
  }
  return null;
}

export function extractStreetKey(address: string | null | undefined): string | null {
  const a = String(address || "").trim().toLowerCase();
  if (!a) return null;
  const street = a.split(",")[0] || "";
  const cleaned = street
    .replace(/\b(suite|ste|unit|apt|#)\s*[\w-]+/gi, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length >= 5 ? cleaned : null;
}

export function isFreeEmailDomain(domain: string | null | undefined): boolean {
  return Boolean(domain && FREE_EMAIL_DOMAINS.has(domain.toLowerCase()));
}

export function businessEmailDomain(email: string | null | undefined): string | null {
  const e = String(email || "").trim().toLowerCase();
  if (!e.includes("@")) return null;
  const domain = e.split("@")[1] || "";
  if (!domain || isFreeEmailDomain(domain)) return null;
  return domain;
}

export type DiscoveryQualityInput = {
  name?: string | null;
  providerPlaceId?: string | null;
  website?: string | null;
  businessStatus?: string | null;
  types?: string[] | null;
  address?: string | null;
  phone?: string | null;
};

/**
 * Conservative reject/flag. Missing email/website/phone is NOT a reject.
 */
export function evaluateDiscoveryQuality(
  input: DiscoveryQualityInput,
): { disposition: "ready" | "needs_attention" | "rejected"; reason: ProspectAiDiscoveryReasonCode | null } {
  const placeId = String(input.providerPlaceId || "").trim();
  const name = String(input.name || "").trim();
  if (!placeId || !name) {
    return { disposition: "rejected", reason: "invalid_business_identity" };
  }
  const status = String(input.businessStatus || "").toUpperCase();
  if (status && status !== "OPERATIONAL") {
    return { disposition: "rejected", reason: "permanently_closed" };
  }
  const domain = normalizeWebsiteDomain(input.website);
  if (domain && DIRECTORY_HOST_RE.test(domain)) {
    return { disposition: "rejected", reason: "directory_or_aggregator" };
  }
  if (DIRECTORY_NAME_RE.test(name)) {
    return { disposition: "rejected", reason: "directory_or_aggregator" };
  }
  if (/^(test|asdf|xxx|spam)\b/i.test(name) || name.length < 2) {
    return { disposition: "rejected", reason: "malformed_provider_record" };
  }
  if (domain && SOCIAL_HOST_RE.test(domain)) {
    return { disposition: "needs_attention", reason: "social_profile_as_website" };
  }
  return { disposition: "ready", reason: null };
}

/** Tokenize requested industry for lightweight relevance. */
export function industryTokens(businessType: string): string[] {
  return String(businessType || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !["and", "the", "for", "with", "near"].includes(t));
}

const MISMATCH_HINTS: Array<{ when: RegExp; excludeTypeOrName: RegExp }> = [
  {
    when: /real\s*estate|realtor|broker/i,
    excludeTypeOrName:
      /title\s*company|apartment\s*complex|mortgage\s*broker|moving\s*company|\bstorage\b|property\s*management/i,
  },
  {
    when: /dent(al|ist)/i,
    excludeTypeOrName: /dental\s*supply|dentist\s*supply|medical\s*supply/i,
  },
  {
    when: /law|attorney|lawyer/i,
    excludeTypeOrName: /legal\s*services\s*directory|process\s*server/i,
  },
];

/**
 * Lightweight relevance gate — not full AI qualification.
 * Returns ready | needs_attention | rejected(industry_mismatch).
 */
export function evaluateDiscoveryRelevance(params: {
  requestedBusinessType: string;
  name?: string | null;
  types?: string[] | null;
  primaryType?: string | null;
}): {
  disposition: "ready" | "needs_attention" | "rejected";
  reason: ProspectAiDiscoveryReasonCode | null;
} {
  const requested = String(params.requestedBusinessType || "").trim();
  if (!requested) return { disposition: "ready", reason: null };

  const typesBlob = [
    ...(Array.isArray(params.types) ? params.types : []),
    params.primaryType || "",
    params.name || "",
  ]
    .join(" ")
    .toLowerCase()
    .replace(/_/g, " ");

  for (const rule of MISMATCH_HINTS) {
    if (!rule.when.test(requested)) continue;
    if (rule.excludeTypeOrName.test(typesBlob)) {
      return { disposition: "rejected", reason: "industry_mismatch" };
    }
  }

  const tokens = industryTokens(requested);
  if (tokens.length === 0) return { disposition: "ready", reason: null };

  const hit = tokens.some((t) => typesBlob.includes(t));
  if (hit) return { disposition: "ready", reason: null };

  // No token overlap — uncertain, not hard reject (still chargeable / counts toward target)
  return { disposition: "needs_attention", reason: "uncertain_category" };
}
