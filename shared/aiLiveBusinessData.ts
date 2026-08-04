/**
 * AI Brain Live Business Data — Phase 1 registry + decision model.
 *
 * Knowledge Sources stay semantic/vector/search based.
 * Live Business Data is structured and queried through typed connectors.
 * Never merge structured catalogs into Knowledge Sources or stuff full catalogs into prompts.
 */

export const LIVE_BUSINESS_DATA_PROVIDER_IDS = [
  "websiteKnowledge",
  "businessPackages",
  "shopify",
  "mls",
  "calendar",
  "inventory",
] as const;

export type LiveBusinessDataProviderId = (typeof LIVE_BUSINESS_DATA_PROVIDER_IDS)[number];

export type LiveBusinessDataProviderStatus =
  | "connected"
  | "disconnected"
  | "coming_soon"
  | "error";

/** Merchant-facing registry row (no JSON / routing editors). */
export type LiveBusinessDataProviderDescriptor = {
  id: LiveBusinessDataProviderId;
  name: string;
  /** Lucide-style icon key for UI mapping. */
  icon: "globe" | "package" | "shoppingBag" | "home" | "calendar" | "boxes";
  /** Static capability labels for the registry (not an admin editor). */
  capabilities: string[];
};

export const LIVE_BUSINESS_DATA_REGISTRY: readonly LiveBusinessDataProviderDescriptor[] = [
  {
    id: "websiteKnowledge",
    name: "Knowledge Sources",
    icon: "globe",
    capabilities: ["semantic_search", "website_scan"],
  },
  {
    id: "businessPackages",
    name: "Offers & Payment Links",
    icon: "package",
    capabilities: ["lookupPackage", "listPackages", "findPackageByName"],
  },
  {
    id: "shopify",
    name: "Shopify Products",
    icon: "shoppingBag",
    capabilities: ["searchProducts", "lookupProduct"],
  },
  {
    id: "mls",
    name: "MLS Listings",
    icon: "home",
    capabilities: ["searchListings", "lookupListing"],
  },
  {
    id: "calendar",
    name: "Calendar",
    icon: "calendar",
    capabilities: ["availability", "bookingLink"],
  },
  {
    id: "inventory",
    name: "Inventory",
    icon: "boxes",
    capabilities: ["searchInventory"],
  },
] as const;

export type LiveBusinessDataProviderView = LiveBusinessDataProviderDescriptor & {
  status: LiveBusinessDataProviderStatus;
  /** Short merchant-facing detail, e.g. "2,483 Products" or "Connected". */
  detail: string | null;
};

/** Structured record returned by a live provider (not a knowledge document). */
export type LiveBusinessDataRecord = {
  providerId: LiveBusinessDataProviderId;
  recordType: string;
  /** Compact line for the prompt — never a full catalog dump. */
  summary: string;
  data: Record<string, unknown>;
};

export type LiveBusinessDataDecision = {
  /** Continue using Knowledge Sources / published facts. */
  needsKnowledge: boolean;
  /** Invoke one or more live structured providers. */
  needsLiveBusinessData: boolean;
  providerIds: LiveBusinessDataProviderId[];
  reason: string;
};

const PACKAGE_NAME_HINT_RE =
  /\b(?:featured\s+business|business\s+listing|directory\s+listing|starter|premium|basic|pro|featured|standard|enterprise)\s*(?:package|plan|listing)?\b/i;
const PACKAGE_QUESTION_RE =
  /\b(?:packages?|plans?|pricing\s+plans?|featured\s+business|business\s+listing|directory|advertis(?:e|ing)|checkout|sign\s*up\s+for|onboard(?:ing)?)\b/i;
const SHOPIFY_PRODUCT_RE =
  /\b(?:product|products|in\s+stock|sku|backpack|shirt|hoodie|variant|shopify|do\s+you\s+(?:sell|have|carry)|waterproof)\b/i;
const MLS_LISTING_RE =
  /\b(?:bedroom|bath(?:room)?|waterfront|listing|mls|sq\.?\s*ft|square\s+feet|homes?\s+for\s+sale|property|real\s+estate|condo|townhome)\b/i;
const CALENDAR_RE =
  /\b(?:schedule|book(?:ing)?|appointment|available|availability|calendly|when\s+can\s+i|pick\s+a\s+time|demo\s+call)\b/i;
const KNOWLEDGE_ONLY_RE =
  /\b(?:hours?|open(?:ing)?|address|location|where\s+are\s+you|policy|refund|shipping|about\s+(?:your|the)\s+company|who\s+are\s+you|what\s+do\s+you\s+do)\b/i;

/**
 * Decide which source layers AI Brain should use for this turn.
 * Pure — no I/O. Does not replace resolveAiRouting; complements sub-intents.
 */
export function resolveLiveBusinessDataDecision(input: {
  message: string;
  subIntents?: string[] | null;
}): LiveBusinessDataDecision {
  const message = String(input.message || "").trim();
  const sub = new Set((input.subIntents || []).map((s) => String(s).toLowerCase()));
  const providerIds: LiveBusinessDataProviderId[] = [];

  const wantsPackages =
    sub.has("pricing_question") ||
    sub.has("benefits_question") ||
    sub.has("listing_join_question") ||
    PACKAGE_QUESTION_RE.test(message) ||
    PACKAGE_NAME_HINT_RE.test(message);

  const wantsShopify = SHOPIFY_PRODUCT_RE.test(message) && !wantsPackages;
  const wantsMls = MLS_LISTING_RE.test(message);
  const wantsCalendar =
    sub.has("booking_question") || CALENDAR_RE.test(message);
  const knowledgeOnlyHint =
    KNOWLEDGE_ONLY_RE.test(message) &&
    !wantsPackages &&
    !wantsShopify &&
    !wantsMls &&
    !wantsCalendar;

  if (wantsPackages) providerIds.push("businessPackages");
  if (wantsShopify) providerIds.push("shopify");
  if (wantsMls) providerIds.push("mls");
  if (wantsCalendar) providerIds.push("calendar");

  // Default: knowledge stays on for almost every info turn except pure MLS/product SKU hunts.
  let needsKnowledge = true;
  if (wantsMls && !wantsPackages && !knowledgeOnlyHint) {
    needsKnowledge = Boolean(
      sub.has("hours_question") ||
        sub.has("location_question") ||
        sub.has("policy_question") ||
        PACKAGE_QUESTION_RE.test(message),
    );
  }
  if (wantsShopify && !wantsPackages) {
    needsKnowledge = false;
  }
  if (knowledgeOnlyHint) {
    needsKnowledge = true;
  }
  // Package questions benefit from both: structured packages + semantic FAQ/about.
  if (wantsPackages) {
    needsKnowledge = true;
  }

  const unique = [...new Set(providerIds)];
  return {
    needsKnowledge,
    needsLiveBusinessData: unique.length > 0,
    providerIds: unique,
    reason:
      unique.length === 0
        ? knowledgeOnlyHint
          ? "knowledge_only"
          : "knowledge_default"
        : `live:${unique.join("+")}${needsKnowledge ? "+knowledge" : ""}`,
  };
}

/** Extract a likely package/plan name hint from the customer message. */
export function extractPackageNameHint(message: string): string | null {
  const m = String(message || "").match(
    /\b((?:featured\s+business|business\s+listing|directory\s+listing|[A-Za-z][\w\s-]{1,40})\s+(?:package|plan|listing))\b/i,
  );
  if (m?.[1]) return m[1].trim();
  const featured = String(message || "").match(/\b(featured\s+business)\b/i);
  if (featured?.[1]) return featured[1].trim();
  return null;
}

export const LIVE_BUSINESS_DATA_HEADER = "LIVE BUSINESS DATA";

/**
 * Compact prompt section for structured connector results.
 * Callers must pass only the records needed for this turn (never a full catalog).
 */
export function buildLiveBusinessDataPromptBlock(
  records: LiveBusinessDataRecord[],
): { text: string; recordCount: number; providerIds: LiveBusinessDataProviderId[] } {
  if (!records.length) {
    return { text: "", recordCount: 0, providerIds: [] };
  }
  const providerIds = [
    ...new Set(records.map((r) => r.providerId)),
  ] as LiveBusinessDataProviderId[];
  const lines = records.map((r) => `- [${r.providerId}/${r.recordType}] ${r.summary}`);
  const hasOffers = providerIds.includes("businessPackages");
  const text = `${LIVE_BUSINESS_DATA_HEADER} (structured connectors — authoritative for offers/packages, products, listings, and availability when present; structured offers win over scanned website pricing):
${lines.join("\n")}

When this section answers the customer, lead with it. Do not invent offers, prices, checkout URLs, or availability beyond these rows.${
    hasOffers
      ? `

OFFERS & PAYMENT LINKS:
- Use only the exact priceDisplay and checkoutUrl values shown above.
- If Checkout is "not configured" or missing, do not invent a payment link.
- If several offers could fit, compare briefly or ask which one they mean.
- Payment/checkout links require human approval before send — include the exact stored URL in your draft when purchase intent is clear, but treat it as pending agent approval.`
      : ""
  }`;
  return { text, recordCount: records.length, providerIds };
}

/** Cap how many structured rows may enter a single prompt. */
export const LIVE_BUSINESS_DATA_PROMPT_RECORD_LIMIT = 8;

export function getLiveBusinessDataProviderDescriptor(
  id: LiveBusinessDataProviderId,
): LiveBusinessDataProviderDescriptor | undefined {
  return LIVE_BUSINESS_DATA_REGISTRY.find((p) => p.id === id);
}
